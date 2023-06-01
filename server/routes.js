'use strict';
const dotenv = require('dotenv');
dotenv.config();
const Router = require('koa-router');
const router = new Router();
const bodyParser = require('koa-bodyparser');
const { verifyToken, getQueryKey } = require("koa-shopify-auth-cookieless");
const { verifyHmacWebhook, getShopifyRequestHeaders, getAccessToken, getIntegrationData, orderIntegrationIsEnabled, orderAutomaticSendIsEnabled, isPickUpsShippingMethod, getOrderData, getResponseJsonAndSaveLogs, saveOrderPickupPoint, autoSendToUps, getCustomerTypeApi, getDate, getMetafieldsCount } = require('./helper');
const { createPickUpsOptions } = require('./init');
const { HOST, API_VERSION,DEBUG_MODE } = process.env;

router.get('/', async (ctx, next) => {
    const shop = getQueryKey(ctx, "shop");
    const token = await getAccessToken(shop);
    ctx.state = { shopify: { shop: shop, accessToken: token } };
    await verifyToken(ctx, next);

    if(shop && ctx.request.query.session) {
        try {
            await createPickUpsOptions(shop, token);
        } catch (e) {
            console.log(e);
        }
    }
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
                        "type": item.type
                    }
            })
        };
        const apiUrl = `https://${shop}/admin/api/${API_VERSION}/metafields/${item.id}.json`;
        const response = await fetch(apiUrl, shippingDataRequestOptions);

        const json = await getResponseJsonAndSaveLogs('save-shipping-data', shop, apiUrl, shippingDataRequestOptions ,response);
        if(json !== false) {
            responseData = responseData.concat(json);
        }
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
    const checkAuthInformation = data.checkAuthInformation || false;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/metafields.json?namespace=pickups-options&metafield[owner_resource]=shop`;
    const response = await fetch(apiUrl, requestOptions);
    const dataJson = await getResponseJsonAndSaveLogs('get-shipping-data', shop, apiUrl, requestOptions ,response);

    const apiIntegrationUrl = `https://${shop}/admin/api/${API_VERSION}/metafields.json?namespace=pickups-integration&metafield[owner_resource]=shop`;
    const responseIntegration = await fetch(apiIntegrationUrl, requestOptions);
    const dataJsonIntegration = await getResponseJsonAndSaveLogs('get-shipping-data', shop, apiIntegrationUrl, requestOptions ,responseIntegration);

    const apiClosestUrl = `https://${shop}/admin/api/${API_VERSION}/metafields.json?namespace=pickups-closest&metafield[owner_resource]=shop`;
    const responseClosest = await fetch(apiClosestUrl, requestOptions);
    const dataJsonClosest = await getResponseJsonAndSaveLogs('get-shipping-data', shop, apiClosestUrl, requestOptions ,responseClosest);

    if(dataJson.metafields !== undefined) {
        let metafieldsArray = dataJson.metafields;
        try {
            metafieldsArray = metafieldsArray.concat(dataJsonIntegration.metafields, dataJsonClosest.metafields);
        } catch (e){

        }

        if (!isPrivate) {
            metafieldsArray = metafieldsArray.filter((item) => item.key === 'upsPickupsMapType' || item.key === 'upsPickupsType' || item.key === 'upsPickupsOpenMapOnLoad' || item.key === 'upsPickupsChangePickupPoint')
        }

        dataJson.metafields = metafieldsArray;

        if(checkAuthInformation){
            const integrationData = metafieldsArray.filter((item) => item.namespace === 'pickups-integration');
            const customerTypeResponse = await getCustomerTypeApi(integrationData);

            let isAuthValid = 'error';
            let customerType = '';

            if(!customerTypeResponse['errors']){
                isAuthValid = false
            }

            if(customerTypeResponse['response']){
                isAuthValid = true;
                customerType = customerTypeResponse['response'] || 'מזומן';
            }

            dataJson.isAuthValid = isAuthValid;
            dataJson.customerType = customerType;
        }
    }

    ctx.body = dataJson;
    ctx.statusCode = 200;
});

router.post('/api/get-product-data', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const productId = data.productId;

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/products/${productId}.json`;
    const response = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('get-product-data', shop, apiUrl, requestOptions, response);
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

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const response = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('get-order-pickup-point', shop, apiUrl, requestOptions, response);
    ctx.statusCode = 200;
});

router.post('/api/save-order-pickup-point', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const autoSend = data.autoSend;
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
                    "type": "json"
                }
        })
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const response = await fetch(apiUrl, requestOptions);

    await getResponseJsonAndSaveLogs('save-order-pickup-point', shop, apiUrl, requestOptions, response);

    if(autoSend) {
        await autoSendToUps(shop, orderId);
    }

    const order = await getOrderData(shop, orderId);

    const orderNote = order.order.note ? `${order.order.note}\r\n` : '';

    const pickupPointObject = JSON.parse(pickupPoint);

    let pickupNote = `${orderNote}${pickupPointObject['iid']}\r\n${pickupPointObject['title']}`;

    if(pickupPointObject['city']){
        pickupNote += `\r\n${pickupPointObject['street']}, ${pickupPointObject['city']}`;
    }

    const notesRequestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "note": pickupNote
                }
        })
    };

    const apiOrdersUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const notesResponse = await fetch(apiOrdersUrl, notesRequestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-pickup-point', shop, apiOrdersUrl, notesRequestOptions, notesResponse);
    ctx.statusCode = 200;
});

router.post('/api/save-order-additional-info', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const fields = data.fields;
    const shop = data.shop;
    const orderId = data.orderId;
    const accessToken = await getAccessToken(shop);

    console.log('data',data)

    const orderBody = {
        "order": {
            "id": orderId,
            "metafields": []
        }
    };

    for (const key in fields){
        const item = fields[key];

        orderBody["order"]["metafields"].push({
            'key': item.key,
            'namespace': item.namespace,
            'value': item.value,
            'type': item.type
        });
    }

    console.log('orderBody', orderBody);
    const requestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify(orderBody)
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const metafieldsResponse = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-additional-info', shop, apiUrl, requestOptions, metafieldsResponse);
    ctx.statusCode = 200;
/*
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const orderIsDDO = data.orderIsDDO || '';
    const orderCODDetails = data.orderCODDetails || '';
    const orderCODValue = data.orderCODValue || '';
    const orderIsUDR = data.orderIsUDR || '';
    const orderIsReturn = data.orderIsReturn || '';
    const orderNumOfPackages = data.orderNumOfPackages || '';

    const accessToken = await getAccessToken(shop);

    const requestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "metafields":
                [{
                    "namespace": "ups_pickup",
                    "key": "pickups_is_ddo",
                    "value": orderIsDDO,
                    "type": "string"
                },
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_cod_details",
                    "value": orderCODDetails,
                    "type": "string"
                },
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_cod_value",
                    "value": orderCODValue,
                    "type": "string"
                },
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_is_udr",
                    "value": orderIsUDR,
                    "type": "string"
                },
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_is_return",
                    "value": orderIsReturn,
                    "type": "string"
                },
                {
                    "namespace": "ups_pickup",
                    "key": "pickups_num_of_packages",
                    "value": orderNumOfPackages,
                    "type": "string"
                }]
        })
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const metafieldsResponse = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-additional-info', shop, apiUrl, requestOptions, metafieldsResponse);
    ctx.statusCode = 200;*/
})

router.post('/api/save-order-waybill-number', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const wayBillNumber = data.wayBillNumber;
    const orderTags = data.orderTags.split(',').filter((item) => !item.includes('UPS Error:')).join(',');
    const additionalTags = data.additionalTags ? ', '+data.additionalTags : '';
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
                    "type": "string"
                }
        })
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const metafieldsResponse = await fetch(apiUrl, requestOptions);

    await getResponseJsonAndSaveLogs('save-order-waybill-number', shop, apiUrl, requestOptions, metafieldsResponse);

    const tagsRequestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "order":
                {
                    "id": orderId,
                    "tags": `${orderTags}, Sent To UPS, ${wayBillNumber}, ${orderWeight}${additionalTags}`
                }
        })
    };

    const apiOrdersUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const tagsResponse = await fetch(apiOrdersUrl, tagsRequestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-waybill-number', shop, apiOrdersUrl, tagsRequestOptions, tagsResponse);
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
                    "type": "string"
                }
        })
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const response = await fetch(apiUrl, requestOptions);

    await getResponseJsonAndSaveLogs('save-order-leadid', shop, apiUrl, requestOptions, response);

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

    const apiOrdersUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const tagsResponse = await fetch(apiOrdersUrl, tagsRequestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-leadid', shop, apiOrdersUrl, tagsRequestOptions, tagsResponse);
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
                    "type": "string"
                }
        })
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const response = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-weight', shop, apiUrl, requestOptions, response);
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
        const fulfillmentOrderResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/fulfillment_orders.json`, locationRequestOptions);
        const fulfillmentOrderJson = await fulfillmentOrderResponse.json();
        const fulfillmentOrderId = fulfillmentOrderJson.fulfillment_orders[0]['id'];

        const requestOptions = {
            method: 'POST',
            headers: getShopifyRequestHeaders(accessToken),
            body: JSON.stringify({
                "fulfillment": {
                    "line_items_by_fulfillment_order": [
                        {
                            "fulfillment_order_id": fulfillmentOrderId
                        }
                    ],
                    "notify_customer": customerNotify,
                    "tracking_info": {
                        "company": "ups-ship",
                        "number": wayBillNumber,
                        "url": "https://site.ship.co.il/?trackNumber="+wayBillNumber
                    }
                }
            })
        };

        const apiUrl = `https://${shop}/admin/api/${API_VERSION}/fulfillments.json`;
        const fulfillmentsResponse = await fetch(apiUrl, requestOptions);

        output = await getResponseJsonAndSaveLogs('fullfill-order-items', shop, apiUrl, requestOptions, fulfillmentsResponse);

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

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const tagsResponse = await fetch(apiUrl, tagsRequestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-tags-error', shop, apiUrl, tagsRequestOptions, tagsResponse);
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

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const saveOrderResponse = await fetch(apiUrl, requestOptions);

    await autoSendToUps(shop, orderId);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-phone-number', shop, apiUrl, requestOptions, saveOrderResponse);
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

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const saveOrderResponse = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-note', shop, apiUrl, requestOptions, saveOrderResponse);
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

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
    const response = await fetch(apiUrl, requestOptions);
    ctx.body = await getResponseJsonAndSaveLogs('get-waybill-number', shop, apiUrl, requestOptions, response);
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

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const response = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('get-order', shop, apiUrl, requestOptions, response);
    ctx.statusCode = 200;
});

router.post('/api/webhook/order-create', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const rawBody = ctx.request.rawBody;
    const shop = headers['x-shopify-shop-domain'];
    const hmac = headers['x-shopify-hmac-sha256'];
    const errorPrefix = 'Auto Send to Ups: ';

    console.log(getDate()+' webhook/order-create shop: '+shop+' | init');

    if(headers['x-shopify-topic'] !== 'orders/create'){
        throw new Error(`${errorPrefix} topic is wrong`);
    }

    try {
        console.log(getDate()+' webhook/order-create shop: '+shop+' | before verifyHmacWebhook');
        if(!await verifyHmacWebhook(rawBody, hmac)){
            throw new Error('hmac is not verified');
        }
        console.log(getDate()+' webhook/order-create shop: '+shop+' | after verifyHmacWebhook');

        const orderId = body.id;
        const shippingMethod = body.shipping_lines[0];
        const shippingMethodCode = shippingMethod.code;
        let closestPointsChosenPoint;
        if(shippingMethodCode.includes('pickups_')){
            closestPointsChosenPoint = JSON.stringify({
                "title": shippingMethod.title,
                "street": '',
                "city": '',
                "iid": shippingMethodCode.replace('pickups_','')
            })
        }
        const isPickups = body.shipping_lines.findIndex((item) => isPickUpsShippingMethod(item.code));

        console.log(getDate()+' webhook/order-create shop: '+shop+' | before getOrderData');
        const orderData = await getOrderData(shop, orderId);
        console.log(getDate()+' webhook/order-create shop: '+shop+' | after getOrderData');
        const pickupPoint = closestPointsChosenPoint ? closestPointsChosenPoint : orderData.order.note;

        if(pickupPoint !== '' && pickupPoint !== null) {
            try {
                if(isPickups > -1) {
                    console.log(getDate()+' webhook/order-create shop: '+shop+' | before saveOrderPickupPoint');
                    await saveOrderPickupPoint(shop, orderId, pickupPoint, true);
                    console.log(getDate()+' webhook/order-create shop: '+shop+' | after saveOrderPickupPoint');
                }
            } catch (e) {
                console.log('Error: '+e)
            }
        }

        console.log(getDate()+' webhook/order-create shop: '+shop+' | before getIntegrationData');
        const integrationData = await getIntegrationData(shop);
        console.log(getDate()+' webhook/order-create shop: '+shop+' | after getIntegrationData');
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
                console.log(getDate()+' webhook/order-create shop: '+shop+' | before auto-send-to-ups');
                await fetch(`${HOST}api/send-to-ups?shop=${shop}&id=${orderId}&automatic=true`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
                console.log(getDate()+' webhook/order-create shop: '+shop+' | after auto-send-to-ups');
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
    const rawBody = ctx.request.rawBody;
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
    const rawBody = ctx.request.rawBody;
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
    const rawBody = ctx.request.rawBody;
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
