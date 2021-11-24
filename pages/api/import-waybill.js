const { HOST } = process.env;
const { updatedMetafields, getFieldFromIntegrationData, getRestApiAccessToken, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, isPickUpsShippingMethod } = require('../../server/helper');

async function getOrderPickupsData(shop, orderId){
    const getWaybillNumberResponse = await fetch(`${HOST}api/get-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });

    const getWaybillNumberJson = await getWaybillNumberResponse.json();

    let orderSentToUps = false;
    let orderLeadId = '';
    let orderWeight = '';
    getWaybillNumberJson.metafields.forEach((item) => {
        if(item.key === 'pickups_point_wb'){
            orderSentToUps = true;
        }
        if(item.key === 'pickups_point_lead_id'){
            orderLeadId = item.value
        }

        if(item.key === 'pickups_point_order_weight'){
            orderWeight = item.value
        }
    })

    return { 'orderSentToUps': orderSentToUps, 'orderLeadId': orderLeadId, 'orderWeight': orderWeight};
}

async function saveWayBillNumberOnOrder(shop, orderId, wayBillNumber, orderTags, orderWeight){
    const response = await fetch(`${HOST}api/save-order-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'wayBillNumber': wayBillNumber, 'orderTags': orderTags, 'orderWeight': orderWeight})
    });

    return await response.json();
}

async function fullfillOrderItems(shop, orderId, wayBillNumber, customerNotify){
    const response = await fetch(`${HOST}api/fullfill-order-items`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'wayBillNumber': wayBillNumber, 'customerNotify': customerNotify})
    });

    return await response.json();
}

async function saveOrderTagError(shop, orderId, orderTags, error){
    if(orderTags.includes(error)){
        return true;
    }
    const response = await fetch(`${HOST}api/save-order-tags-error`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'orderError': `UPS Error: ${error}`, 'orderTags': orderTags})
    });

    return await response.json();
}

function getHouseNumber(streetAddress){
    const houseNumber = streetAddress.match(/[0-9]+/g);
    if(houseNumber !== null){
        return houseNumber[0];
    }
    return '';
}

function isValidPhoneNumber(phoneNumber){
    if(!phoneNumber) return false;
    return !!validatePhoneNumber(phoneNumber);
}

function validatePhoneNumber(phoneNumber){
    try {
        const validNumber = phoneNumber.replace(' ', '').replace('+972', '0').replace(/-/g, '').match(/^0(5[^7])[0-9]{7}$/);
        if(validNumber === null) return false;
        return validNumber[0];
    } catch (e){
        return phoneNumber;
    }
}

function splitPhonePrefix(phoneNumber){
    const validatedNumber = phoneNumber.replace('+972','0').replace(/-/g, '');
    const split = validatedNumber.match(/^0(5[^7]|[2-4]|[8-9]|7[0-9])[0-9]{7}$/);
    const prefix = '0'+split[1];

    return {
        'prefix': prefix,
        'number': validatedNumber.replace(prefix, '')
    }
}

function getCustomerName(order){
    return `${order.shipping_address.first_name} ${order.shipping_address.last_name}`;
}

function getPhoneNumber(order){
    return order.shipping_address.phone;
}

function getPickupPoint(data){
    const pickupPoint = data.orderPickupPoint;
    let id = null;
    let title = null;

    if(pickupPoint !== null){
        id = pickupPoint.iid;
        title = pickupPoint.title;
    }

    return {
        'id': id,
        'title': title
    }
}

function getReference2Field(reference2Type, order, orderPickupsData){
    const pickupPoint = getPickupPoint(orderPickupsData);
    const pickupPointId = pickupPoint['id'];
    const pickupPointTitle = pickupPoint['title'];

    switch(reference2Type){
        case 'order_id':
            return order.name.replace('#', '');
        case 'customer_name':
            return getCustomerName(order);
        case 'email':
            return order.email;
        case 'phone_number':
            return validatePhoneNumber(getPhoneNumber(order));
        case 'pickup_point_id':
            return pickupPointId;
        case 'pickup_point_name':
            return pickupPointTitle;
        default:
            return '';
    }
}

function getOrderWeight(integrationData, orderItems){
    const defaultWeight = 1;

    const orderWeightType = getFieldFromIntegrationData(integrationData,'upsIntegrationOrderWeight');
    if(orderWeightType === 'fixed_value'){
        const itemsTotalWeight = getFieldFromIntegrationData(integrationData,'upsIntegrationOrderWeightValue');
        if(itemsTotalWeight > 0){
            return itemsTotalWeight;
        }
        return defaultWeight;
    }

    let itemsTotalWeight = orderItems.reduce( ( sum, { grams, quantity } ) => sum + (grams * quantity) , 0);

    if(itemsTotalWeight > 0){
        return itemsTotalWeight/1000;
    }
    return defaultWeight;
}

async function restApiImportWaybillFromLeadId(accessToken, integrationData, getOrderJson, orderPickupsData){

    let apiHost = getFieldFromIntegrationData(integrationData,'upsApiCreateUrl');

    if(!apiHost || apiHost === 'X'){
        apiHost = 'https://plugins.ship.co.il/';
    }

    const apiUrl = apiHost + 'api/v1/easyship/get-leads-track-numbers';
    const leadId = orderPickupsData.orderLeadId;

    let functionArgs = {
        'model.leadIds': leadId
    }

    const params = new URLSearchParams(functionArgs).toString();

    const requestOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };

    let trackingNumber;
    try {
        const response = await fetch(apiUrl+'?'+params, requestOptions);

        const data = await response.json();

        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['Message'] || data['ErrorCode'] > 0){
            throw data['Message'] || data['ErrorMessage'];
        }

        if (!data[0]['TrackNumber']) {
            throw 'Tracking Number Not Found';
        }
        trackingNumber = data[0]['TrackNumber'];

    } catch (e) {
        console.log('restApiImportWaybillFromLeadId Error: ',e);
        return { 'errors': e }
    }

    return { 'wayBillNumber': trackingNumber };
}

function isFulfillOrderItemsEnabled(integrationData){
    return getFieldFromIntegrationData(integrationData,'fulfillOrderItems') === 'true';
}

function isFulfillOrderItemsCustomerNotify(integrationData){
    return getFieldFromIntegrationData(integrationData,'fulfillOrderItemsNotify') === 'true';
}

export default async (req, res) => {
    const shop = req.query.shop;
    const hmac = req.query.hmac;
    const hmacVerified = req.query.automatic;
    const isBulkAction = req.query['ids[]'] !== undefined;
    let orderIds = isBulkAction ? req.query['ids[]'] : req.query.id;
    const requestQuery = req.query;
    let output = '';

    if(!hmacVerified && verifyHmac(requestQuery, hmac, isBulkAction) === false){
        output = 'Auth Error';
    }

    if(output === '') {

        await updatedMetafields(shop);

        if (Array.isArray(orderIds) === false) {
            orderIds = [orderIds];
        }

        for (let i = 0, orderIdsLength = orderIds.length; i < orderIdsLength; ++i) {
            const orderId = orderIds[i];

            if (output !== '') {
                output += '<br />';
            }
            const getOrderJson = await getOrderData(shop, orderId);
            if (getOrderJson.errors) {
                output += `${getOrderJson.errors}`;
                continue;
            }

            const orderName = getOrderJson.order.name;
            const orderTags = getOrderJson.order.tags;
            const errorsPrefix = `Cant import waybill for order ${orderName} - `;

            const orderPickupsData = await getOrderPickupsData(shop, orderId);
            if (orderPickupsData.orderSentToUps) {
                output += `Order ${orderName} Already Sent to Ups`;
                continue;
            }

            if(!orderPickupsData.orderLeadId){
                output += `Lead Id not found for order ${orderName}`;
                continue;
            }

            const integrationData = await getIntegrationData(shop);
            if(integrationData['error']){
                output += `${errorsPrefix} ${integrationData['message']}`;
                continue;
            }
            if (!orderIntegrationIsEnabled(integrationData)) {
                const error = 'Order Integration setting is Disabled';
                await saveOrderTagError(shop, orderId, orderTags, error);
                output += `${errorsPrefix} ${error}`;
                continue;
            }

            const { isLoggedIn, accessToken } = await getRestApiAccessToken(integrationData ,'create');
            if (!isLoggedIn) {
                const error = 'Rest API Auth Error';
                await saveOrderTagError(shop, orderId, orderTags, error);
                output += `${errorsPrefix} ${error}`;
                continue;
            }
            const upsData = await restApiImportWaybillFromLeadId(accessToken, integrationData, getOrderJson, orderPickupsData);

            if (upsData.errors) {
                console.log('upsData.errors', upsData.errors);
                await saveOrderTagError(shop, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${upsData.errors}`;
                continue;
            }

            const wayBillNumber = upsData.wayBillNumber;
            const orderWeight = orderPickupsData.orderWeight;

            const response = await saveWayBillNumberOnOrder(shop, orderId, wayBillNumber, orderTags, orderWeight);
            if (response.errors) {
                await saveOrderTagError(shop, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${response.errors}`;
                continue;
            }

            output += `Order ${orderName} Sent to UPS `;

            if(isFulfillOrderItemsEnabled(integrationData)) {
                const fulfillResponse = await fullfillOrderItems(shop, orderId, wayBillNumber, isFulfillOrderItemsCustomerNotify(integrationData));
                if (fulfillResponse.errors) {
                    output += `<br /> ${fulfillResponse.errors}`;
                }
            }
        }

    }

    const backButtonText = isBulkAction ? 'Back to my orders' : 'Back to my order';
    const messageContent = output;

    const outputHtml = `<link rel="stylesheet" href="../api-output.css"><div class="message-container"><div class="message-wrapper">${messageContent}</div><button onClick="window.history.back();">${backButtonText}</button></div>`;

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html');
    res.end(outputHtml);
}
