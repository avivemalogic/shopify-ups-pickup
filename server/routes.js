'use strict';
const dotenv = require('dotenv');
dotenv.config();
const Router = require('koa-router');
const router = new Router();
const bodyParser = require('koa-bodyparser');
const { verifyToken, getQueryKey } = require("koa-shopify-auth-cookieless");
const { verifyHmacWebhook, getShopifyRequestHeaders, getAccessToken, getIntegrationData, orderIntegrationIsEnabled, orderAutomaticSendIsEnabled, isPickUpsShippingMethod, getOrderData, saveOrderNote, saveOrderPickupPoint, autoSendToUps } = require('./helper');
const { createPickUpsOptions } = require('./init');
const { HOST, API_VERSION,DEBUG_MODE } = process.env;

router.get('/', async (ctx, next) => {
    const shop = getQueryKey(ctx, "shop");
    const token = await getAccessToken(shop);
    ctx.state = { shopify: { shop: shop, accessToken: token } };
    await verifyToken(ctx, next);

    await createPickUpsOptions(shop, token);
});

router.post('/api/save-shipping-data', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const fields = data.fields;
    const shop = data.shop;
    let responseData = [];
    const accessToken = await getAccessToken(shop);

    for (const key in fields){
        const item = fields[key];

        const shippingDataRequestOptions = {
            method: 'PUT',
            headers: getShopifyRequestHeaders(accessToken),
            body: JSON.stringify({
                "metafield":
                    {
                        "id": item.id,
                        "value": item.value,
                        "value_type": item.value_type
                    }
            })
        };
        const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/metafields/${item.id}.json`, shippingDataRequestOptions);
        if(DEBUG_MODE === 'true'){
            console.log(response);
        }
        const json = await response.json();
        responseData = responseData.concat(json);
    }
    ctx.body = responseData;
    ctx.statusCode = 200;
});

router.post('/api/set-shipping-data', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;

    const accessToken = await getAccessToken(shop);

    await createPickUpsOptions(shop, accessToken);

    ctx.body = 'done';
    ctx.statusCode = 200;
});

router.post('/api/get-shipping-data', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const isPrivate = data.isPrivate;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/metafields.json`, requestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(response);
    }
    const dataJson = await response.json();

    if(!isPrivate){
        dataJson.metafields = dataJson.metafields.filter((item) => item.key === 'upsPickupsMapType' || item.key === 'upsPickupsType' || item.key === 'upsPickupsOpenMapOnLoad' || item.key === 'upsPickupsChangePickupPoint')
    }

    ctx.body = dataJson;
    ctx.statusCode = 200;
});

router.post('/api/get-order-pickup-point', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`, requestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(response);
    }
    ctx.body = await response.json();
    ctx.statusCode = 200;
});

router.post('/api/save-order-pickup-point', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const pickupPoint = data.pickupPoint;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "metafield":
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_point_json",
                    "value": pickupPoint,
                    "value_type": "json_string"
                }
        })
    };

    await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`, requestOptions);

    await autoSendToUps(shop, orderId);

    const pickupPointObject = JSON.parse(pickupPoint);
    const tagsRequestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "note": `${pickupPointObject['iid']}\r\n${pickupPointObject['title']}\r\n${pickupPointObject['street']}, ${pickupPointObject['city']}`
                }
        })
    };

    const tagsResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, tagsRequestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(tagsResponse);
    }
    ctx.body = await tagsResponse.json();
    ctx.statusCode = 200;
});

router.post('/api/save-order-waybill-number', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const wayBillNumber = data.wayBillNumber;
    const orderTags = data.orderTags.split(',').filter((item) => !item.includes('UPS Error:')).join(',');
    const orderWeight = data.orderWeight+' Kg';

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "metafield":
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_point_wb",
                    "value": wayBillNumber,
                    "value_type": "string"
                }
        })
    };

    await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`, requestOptions);

    const tagsRequestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "tags": `${orderTags}, Sent To UPS, ${wayBillNumber}, ${orderWeight}`
                }
        })
    };

    const tagsResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, tagsRequestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(tagsResponse);
    }
    ctx.body = await tagsResponse.json();
    ctx.statusCode = 200;
})

router.post('/api/save-order-leadid', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const leadId = data.leadId;
    const orderTags = data.orderTags.split(',').filter((item) => !item.includes('UPS Error:')).join(',');

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "metafield":
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_point_lead_id",
                    "value": leadId,
                    "value_type": "string"
                }
        })
    };

    await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`, requestOptions);

    const tagsRequestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "tags": `${orderTags}, ${leadId}`
                }
        })
    };

    const tagsResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, tagsRequestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(tagsResponse);
    }
    ctx.body = await tagsResponse.json();
    ctx.statusCode = 200;
})

router.post('/api/save-order-weight', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const orderWeight = data.orderWeight;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "metafield":
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_point_order_weight",
                    "value": orderWeight,
                    "value_type": "string"
                }
        })
    };

    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`, requestOptions);

    if(DEBUG_MODE === 'true'){
        console.log(response);
    }
    ctx.body = await response.json();
    ctx.statusCode = 200;
})

router.post('/api/fullfill-order-items', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const wayBillNumber = data.wayBillNumber;
    const customerNotify = data.customerNotify;
    let output;

    const accessToken = await getAccessToken(shop);

    try {
        const locationRequestOptions = {
            method: 'GET',
            headers: getShopifyRequestHeaders(accessToken)
        };
        const locationsResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/locations.json`, locationRequestOptions);
        const locationsJson = await locationsResponse.json();
        if(locationsJson.locations.length > 1){
            throw 'because you are managing more than one warehouse, the fulfillment operation must be completed manually!';
        }
        const locationId = locationsJson.locations[0]['id'];

        const requestOptions = {
            method: 'POST',
            headers: getShopifyRequestHeaders(accessToken),
            body: JSON.stringify({
                "fulfillment": {
                    "location_id": locationId,
                    "notify_customer": customerNotify,
                    "tracking_number": wayBillNumber,
                    "tracking_company": "ups-ship",
                    "tracking_urls": [
                        "https://site.ship.co.il/?trackNumber="+wayBillNumber
                    ]
                }
            })
        };

        const fulfillmentsResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/fulfillments.json`, requestOptions);

        if(DEBUG_MODE === 'true'){
            console.log(fulfillmentsResponse);
        }

        output = await fulfillmentsResponse.json();

    } catch (e){
        console.log('Fulfillment Error: '+e);

        output = {
            'errors': e
        };
    }


    ctx.body = output;
    ctx.statusCode = 200;
})

router.post('/api/save-order-tags-error', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const orderTags = data.orderTags.split(',').filter((item) => !item.includes('UPS Error:')).join(',');
    const orderNewTagError = data.orderError;

    const newTag = `${orderTags.substring(0, 40)}, ${orderNewTagError.substring(0, 40)}`;
    const accessToken = await getAccessToken(shop);

    const tagsRequestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "tags": newTag
                }
        })
    };

    const tagsResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, tagsRequestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(tagsResponse);
    }
    ctx.body = await tagsResponse.json();
    ctx.statusCode = 200;
});

router.post('/api/save-order-phone-number', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const phoneNumber = data.phoneNumber;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "shipping_address": {
                        'phone': phoneNumber
                    }
                }
        })
    };

    const saveOrderResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, requestOptions);

    await autoSendToUps(shop, orderId);

    if(DEBUG_MODE === 'true'){
        console.log(saveOrderResponse);
    }
    ctx.body = await saveOrderResponse.json();
    ctx.statusCode = 200;
});

router.post('/api/save-order-note', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "note": ""
                }
        })
    };

    const saveOrderResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, requestOptions);

    if(DEBUG_MODE === 'true'){
        console.log(saveOrderResponse);
    }
    ctx.body = await saveOrderResponse.json();
    ctx.statusCode = 200;
});

router.post('/api/get-waybill-number', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`, requestOptions);
    ctx.body = await response.json();
    ctx.statusCode = 200;
});

router.post('/api/get-order', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`, requestOptions);
    if(DEBUG_MODE === 'true'){
        console.log(response);
    }
    ctx.body = await response.json();
    ctx.statusCode = 200;
});

router.post('/api/webhook/order-create', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const rawBody = ctx.request.rawBody;
    const shop = headers['x-shopify-shop-domain'];
    const hmac = headers['x-shopify-hmac-sha256'];
    const errorPrefix = 'Auto Send to Ups: ';

    if(headers['x-shopify-topic'] !== 'orders/create'){
        throw new Error(`${errorPrefix} topic is wrong`);
    }

    try {
        if(!await verifyHmacWebhook(rawBody, hmac)){
            throw new Error('hmac is not verified');
        }

        const orderId = body.id;
        const isPickups = body.shipping_lines.findIndex((item) => isPickUpsShippingMethod(item.code));

        const orderData = await getOrderData(shop, orderId);
        const pickupPoint = orderData.order.note;

        if(pickupPoint !== '') {
            try {
                JSON.parse(pickupPoint);
                await saveOrderNote(shop, orderId);

                if(isPickups > -1) {
                    await saveOrderPickupPoint(shop, orderId, pickupPoint);
                }
            } catch (e) { }
        }

        const integrationData = await getIntegrationData(shop);
        if (integrationData['error']) {
            throw new Error(integrationData['message']);
        }
        if (!orderIntegrationIsEnabled(integrationData)) {
            throw new Error(`Order Integration setting is Disabled`);
        }
        if (!orderAutomaticSendIsEnabled(integrationData)) {
            throw new Error(`Order Automatic Send is Disabled`);
        }

        if(isPickups === -1){
            try {
                await fetch(`${HOST}api/send-to-ups?shop=${shop}&id=${orderId}&automatic=true`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                throw new Error(e);
            }
        }
    } catch (e){
        console.log(`${errorPrefix} ${e}`);
    }

    ctx.statusCode = 200;
    ctx.body = 'done';
});

router.post('/api/webhook/customers/redact', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const rawBody = ctx.request.rawBody;
    const shop = headers['x-shopify-shop-domain'];
    const hmac = headers['x-shopify-hmac-sha256'];
    const errorPrefix = 'Shopify Customers Redact: ';

    if(headers['x-shopify-topic'] !== 'customers/redact'){
        throw new Error(`${errorPrefix} topic is wrong`);
    }

    try {
        if(!await verifyHmacWebhook(rawBody, hmac)){
            throw new Error('hmac is not verified');
        }

    } catch (e){
        console.log(`${errorPrefix} ${e}`);
    }

    ctx.statusCode = 200;
    ctx.body = 'No Customers Data is Saved';
});

router.post('/api/webhook/customers/data_request', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const rawBody = ctx.request.rawBody;
    const shop = headers['x-shopify-shop-domain'];
    const hmac = headers['x-shopify-hmac-sha256'];
    const errorPrefix = 'Shopify Customers Request: ';

    if(headers['x-shopify-topic'] !== 'customers/data_request'){
        throw new Error(`${errorPrefix} topic is wrong`);
    }

    try {
        if(!await verifyHmacWebhook(rawBody, hmac)){
            throw new Error('hmac is not verified');
        }

    } catch (e){
        console.log(`${errorPrefix} ${e}`);
    }

    ctx.statusCode = 200;
    ctx.body = 'No Customers Data is Saved';
});

router.post('/api/webhook/shop/redact', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const rawBody = ctx.request.rawBody;
    const shop = headers['x-shopify-shop-domain'];
    const hmac = headers['x-shopify-hmac-sha256'];
    const errorPrefix = 'Shopify Shop Redact: ';

    if(headers['x-shopify-topic'] !== 'shop/redact'){
        throw new Error(`${errorPrefix} topic is wrong`);
    }

    try {
        if(!await verifyHmacWebhook(rawBody, hmac)){
            throw new Error('hmac is not verified');
        }

    } catch (e){
        console.log(`${errorPrefix} ${e}`);
    }

    ctx.statusCode = 200;
    ctx.body = 'Shop deleted from Database';
});

module.exports = router;
