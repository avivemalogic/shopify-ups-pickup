'use strict';
const dotenv = require('dotenv');
dotenv.config();
const Router = require('koa-router');
const router = new Router();
const bodyParser = require('koa-bodyparser');
const { verifyToken, getQueryKey } = require("koa-shopify-auth-cookieless");
const { formatDate, saveOrderTag, isGetWaybillStatusEnabled, getOrderPickupsData, verifyHmacWebhook, createHmacWebhook, isIpWhitelist, getShopifyRequestHeaders, getAccessToken, getIntegrationData, orderIntegrationIsEnabled, orderAutomaticSendIsEnabled, isPickUpsShippingMethod, getOrderData, getResponseJsonAndSaveLogs, saveOrderPickupPoint, autoSendToUps, getCustomerTypeApi, getDate, getMetafieldsCount } = require('./helper');
const { createPickUpsOptions } = require('./init');
const { HOST, API_VERSION,DEBUG_MODE } = process.env;

router.get('/', async (ctx, next) => {
    const shop = getQueryKey(ctx, "shop");
    const accessToken = await getAccessToken(shop);
    ctx.state = { shopify: { shop: shop, accessToken: accessToken } };
    await verifyToken(ctx, next);

    if(shop && ctx.request.query.session) {
        try {
            await createPickUpsOptions(shop, accessToken);
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
    const accessToken = data.accessToken || await getAccessToken(shop);

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
    const accessToken = data.accessToken || await getAccessToken(shop);

    await createPickUpsOptions(shop, accessToken);

    ctx.body = 'done';
    ctx.statusCode = 200;
});

router.post('/api/get-shipping-data', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const isPrivate = data.isPrivate;
    const checkAuthInformation = data.checkAuthInformation || false;
    const accessToken = data.accessToken || await getAccessToken(shop);

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

router.post('/api/get-shipping-methods', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const isPrivate = data.isPrivate;
    const accessToken = data.accessToken || await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/shipping_zones.json`;
    const response = await fetch(apiUrl, requestOptions);
    const dataJson = await getResponseJsonAndSaveLogs('get-shipping-methods', shop, apiUrl, requestOptions ,response);

    let shippingNames = [];
    try {
        const shippingZone = dataJson.shipping_zones;
        const shippingNamesDeque = [];
        for (let i = 0; i < shippingZone.length; i++) {
            const rate = shippingZone[i]['price_based_shipping_rates'];
            for (let j = 0; j < rate.length; j++) {
                const rateName = rate[j]['name'];
                if(!shippingNamesDeque.includes(rateName) && !isPickUpsShippingMethod(rateName)) {
                    shippingNamesDeque.push(rateName);
                    shippingNames.push({'value': rateName, 'label': rateName});
                }
            }
        }
    } catch(e){

    }

    ctx.body = shippingNames;
    ctx.statusCode = 200;
});

router.post('/api/get-product-data', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const productId = data.productId;

    const accessToken = data.accessToken || await getAccessToken(shop);

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

    const accessToken = data.accessToken || await getAccessToken(shop);

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
    const orderData = data.orderData;
    const pickupPoint = data.pickupPoint;

    const accessToken = data.accessToken || await getAccessToken(shop);

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
        await autoSendToUps(shop, accessToken, orderId);
    }

    //const order = orderData || await getOrderData(shop, accessToken, orderId);
    //const orderNote = order.order.note ? `${order.order.note}\r\n` : '';

    const pickupPointObject = JSON.parse(pickupPoint);

    let pickupNote = `${pickupPointObject['iid']}\r\n${pickupPointObject['title']}`;

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
    const accessToken = data.accessToken || await getAccessToken(shop);

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

    const requestOptions = {
        method: 'PUT',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify(orderBody)
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const metafieldsResponse = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-additional-info', shop, apiUrl, requestOptions, metafieldsResponse);
    ctx.statusCode = 200;
})

router.post('/api/save-order-waybill-number', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const wayBillNumber = data.wayBillNumber;
    const orderTags = data.orderTags.split(',').filter((item) => !item.includes('UPS Error:')).join(',');
    const additionalTags = data.additionalTags ? ', '+data.additionalTags : '';

    const accessToken = data.accessToken || await getAccessToken(shop);

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
                    "tags": `${orderTags ? orderTags+',' : ''} ${wayBillNumber}${additionalTags}`
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

    const accessToken = data.accessToken || await getAccessToken(shop);

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
    const accessToken = data.accessToken || await getAccessToken(shop);

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

    const accessToken = data.accessToken || await getAccessToken(shop);

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
    const removeTagPrefix = data.removeTagPrefix;
    const orderTags = data.orderTags.split(',').filter((item) => !item.includes('UPS Error:') && (!removeTagPrefix || !item.includes(removeTagPrefix))).join(',');
    const orderNewTagError = data.orderError;

    const newTag = `${orderTags}, ${orderNewTagError.substring(0, 40)}`;
    const accessToken = data.accessToken || await getAccessToken(shop);

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
    await getResponseJsonAndSaveLogs('save-order-tags-error', shop, apiUrl, tagsRequestOptions, tagsResponse);

    ctx.body = { success: true, orderTags: newTag };
    ctx.statusCode = 200;
});

router.post('/api/save-order-phone-number', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;
    const phoneNumber = data.phoneNumber;

    const accessToken = data.accessToken || await getAccessToken(shop);

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

    await autoSendToUps(shop, accessToken, orderId);

    ctx.body = await getResponseJsonAndSaveLogs('save-order-phone-number', shop, apiUrl, requestOptions, saveOrderResponse);
    ctx.statusCode = 200;
});

router.post('/api/save-order-note', bodyParser(), async (ctx, next) => {
    const data = ctx.request.body;
    const shop = data.shop;
    const orderId = data.orderId;

    const accessToken = data.accessToken || await getAccessToken(shop);

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
    const accessToken = data.accessToken || await getAccessToken(shop);

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

    const accessToken = data.accessToken || await getAccessToken(shop);

    const requestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    const apiUrl = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
    const response = await fetch(apiUrl, requestOptions);

    ctx.body = await getResponseJsonAndSaveLogs('get-order', shop, apiUrl, requestOptions, response);
    ctx.statusCode = 200;
});


router.post('/api/webhook/status-update', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const errorPrefix = 'Status Update: ';
    const shop = body.urlShop;
    const orderId = body.ref1;
    const trackNo = body.trackNo;

    let statusCode = 200;
    let errorMessage;
    let returnCode = -1;
    try {
        if(headers['x-shopify-topic'] !== 'custom-status-update'){
            statusCode = 403;
            errorMessage = 'Access denied';
            throw new Error(`${errorPrefix} topic is wrong`);
        }

        const ip = ctx.ip;
        if(isIpWhitelist(ip)){
            statusCode = 403;
            errorMessage = 'Access denied';
            throw new Error('Unauthorized');
        }

        const accessToken = await getAccessToken(shop);

        const getOrderJson = await getOrderData(shop, accessToken, orderId);
        if (getOrderJson.errors) {
            throw new Error(getOrderJson.errors);
        }

        const orderName = getOrderJson.order.name;
        let orderTags = getOrderJson.order.tags;
        const errorsPrefix = `Cant update waybill status for order ${orderName} - `;

        const orderPickupsData = await getOrderPickupsData(shop, accessToken, orderId);
        if (!orderPickupsData.orderWaybillNumber) {
            throw new Error(`Order ${orderName} Doesnt have Waybill`);
        }

        const integrationData = await getIntegrationData(shop, accessToken);
        if(integrationData['error']){
            throw new Error(`${errorsPrefix} ${integrationData['message']}`);
        }

        if (!isGetWaybillStatusEnabled(integrationData)) {
            const error = 'Get waybill status setting is Disabled';
            throw new Error(`${errorsPrefix} ${error}`);
        }

        const waybillStatus = getWaybillStatusFromWebhook(body);

        // TODO: copy func to get-waybill-status
        if(waybillStatus.status) {
            const waybillStatusPrefixTag = 'סטטוס משלוח:';
            const waybillStatusTag = `${waybillStatusPrefixTag} ${waybillStatus.status}`;
            orderTags = await saveOrderTag(shop, accessToken, orderId, orderTags, waybillStatusTag, waybillStatusPrefixTag);
        }

        if(waybillStatus.statusMessage) {
            const waybillStatusDescPrefixTag = 'תיאור משלוח:';
            const waybillStatusDescTag = `${waybillStatusDescPrefixTag} ${waybillStatus.statusMessage}`;
            orderTags = await saveOrderTag(shop, accessToken, orderId, orderTags, waybillStatusDescTag, waybillStatusDescPrefixTag);
        }

        if(waybillStatus.status) {
            const waybillStatusDatePrefixTag = 'סטטוס אחרון:';
            const waybillStatusDateTag = `${waybillStatusDatePrefixTag} נכון ל ${formatDate(new Date())}`;
            orderTags = saveOrderTag(shop, accessToken, orderId, orderTags, waybillStatusDateTag, waybillStatusDatePrefixTag);
        }

        returnCode = 1;
    } catch (e){
        console.log(`${errorPrefix} ${e}`);
        errorMessage = e;
    }

    ctx.statusCode = statusCode;
    ctx.status = statusCode;
    ctx.body = {
        trackNo: trackNo,
        returnCode: returnCode,
        errorMessage: errorMessage
    };
});

const getWaybillStatusFromWebhook = (body) => {

    let statusMessage = '';
    let status = '';
    try {
        const statusCode = body.statusCode;
        status = body.statusDescHeb;
        switch (statusCode) {
            case "4":
                statusMessage = ` ל${body.receivedBy} ב- ${body.statusTime}`;
                break;
            case "6":
                statusMessage = ` מתאריך ${body.statusTime}`;
                break;
            case "7":
                statusMessage = ` ${body.rtsTrackNo}`;
                break;
            case "8":
                statusMessage = ` ${body.exceptionDescHeb}`;
                break;
            case "10":
                statusMessage = ` צפוי להימסר ב-${body.estimateDelivery}`;
                break;
        }
    } catch(e){
        console.log('Error: '+e)
    }

    return {
        'status': status,
        'statusMessage': statusMessage
    }
}

router.post('/api/webhook/order-create', bodyParser(), async (ctx, next) => {
    const headers = ctx.request.headers;
    const body = ctx.request.body;
    const rawBody = ctx.request.rawBody;
    const shop = headers['x-shopify-shop-domain'];
    const hmac = headers['x-shopify-hmac-sha256'];
    const errorPrefix = 'Auto Send to Ups: ';

    console.time('webhook/order-create shop: '+shop);

    if(headers['x-shopify-topic'] !== 'orders/create'){
        throw new Error(`${errorPrefix} topic is wrong`);
    }

    try {
        if(!await verifyHmacWebhook(rawBody, hmac)){
            throw new Error('hmac is not verified');
        }

        const accessToken = await getAccessToken(shop);

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

        const orderData = await getOrderData(shop, accessToken, orderId);
        const pickupPoint = closestPointsChosenPoint ? closestPointsChosenPoint : orderData.order.note;

        if(pickupPoint !== '' && pickupPoint !== null) {
            try {
                if(isPickups > -1) {
                    await saveOrderPickupPoint(shop, accessToken, orderId, pickupPoint, orderData, false);
                }
            } catch (e) {
                console.log('Error: '+e)
            }
        }

        const integrationData = await getIntegrationData(shop, accessToken);
        if (integrationData['error']) {
            throw new Error(integrationData['message']);
        }
        if (!orderIntegrationIsEnabled(integrationData)) {
            throw new Error(`Order Integration setting is Disabled`);
        }
        if (!orderAutomaticSendIsEnabled(integrationData)) {
            throw new Error(`Order Automatic Send is Disabled`);
        }

        try {
            fetch(`${HOST}api/send-to-ups?shop=${shop}&id=${orderId}&automatic=true`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {

            })
            .catch(error => {
                throw new Error(error);
            });
        } catch (e) {
            throw new Error(e);
        }

    } catch (e){
        console.log(`${errorPrefix} ${e}`);
    }

    console.timeEnd('webhook/order-create shop: '+shop);
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