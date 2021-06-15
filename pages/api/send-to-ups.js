const { HOST } = process.env;
const soap = require('soap');
const { webServiceAuthLogin, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, isPickUpsShippingMethod } = require('../../server/helper');

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
    let orderPickupPoint = '';
    getWaybillNumberJson.metafields.forEach((item) => {
        if(item.key === 'pickups_point_wb'){
            orderSentToUps = true;
        }
        if(item.key === 'pickups_point_json'){
            orderPickupPoint = JSON.parse(item.value)
        }
    })

    return { 'orderSentToUps': orderSentToUps, 'orderPickupPoint': orderPickupPoint};
}

async function saveWayBillNumberOnOrder(shop, orderId, wayBillNumber, orderTags){
    const response = await fetch(`${HOST}api/save-order-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'wayBillNumber': wayBillNumber, 'orderTags': orderTags})
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
    return !!phoneNumber.replace('+972','0').replace(/-/g, '').match(/^0(5[^7])[0-9]{7}$/);
}

async function webServiceSendToUps(authClient, integrationData, getOrderJson, orderPickupsData){
    const webServiceShipUrl = integrationData.find((item) => item.key === 'webServiceShipUrl').value;
    const customerName = `${getOrderJson.order.shipping_address.first_name} ${getOrderJson.order.shipping_address.last_name}`;
    const cityName = getOrderJson.order.shipping_address.city;
    const streetAddress = `${getOrderJson.order.shipping_address.address1} ${getOrderJson.order.shipping_address.address2}`;
    const streetName = streetAddress;
    const houseNumber = getHouseNumber(streetAddress);
    const phoneNumber = getOrderJson.order.shipping_address.phone;
    const orderId = getOrderJson.order.name.substring(1);
    const shippingMethod = getOrderJson.order.shipping_lines[0].code;
    let itemsTotalWeight = getOrderJson.order.line_items.reduce( ( sum, { grams, quantity } ) => sum + (grams * quantity) , 0);
    if(itemsTotalWeight > 0){
        itemsTotalWeight /= 1000;
    }

    const isPickups = isPickUpsShippingMethod(shippingMethod);
    let insertShipmentFunction = '';
    let functionArgs = '';

    if(!isValidPhoneNumber(phoneNumber)){
        return {
            'errors': 'Phone Number is invalid'
        }
    }

    if(isPickups) {
        const pickupPoint = orderPickupsData.orderPickupPoint;
        let pickupPointId = null;

        if(pickupPoint){
            pickupPointId = pickupPoint.iid;
        }

        if(pickupPointId === null) {
            return {
                'errors': 'No Pickup Point Selected'
            }
        }

        functionArgs = {
            'info': {
                'ConsigneeAddress': {
                    'CityName': cityName,
                    'ContactPerson': customerName,
                    'CustomerName': customerName,
                    'HouseNumber': houseNumber,
                    'Phone1': phoneNumber,
                    'StreetName': streetName,
                },
                'NumberOfPackages': 1,
                'PickupPointID': pickupPointId,
                'Reference1': orderId,
                'UseDefaultShipperAddress': 'true',
                'Weight': itemsTotalWeight
            }
        }
        insertShipmentFunction = 'InsertPickupsShipment';
    }else {
        functionArgs = {
            'info': {
                'ConsigneeAddress': {
                    'CityName': cityName,
                    'ContactPerson': customerName,
                    'CustomerName': customerName,
                    'HouseNumber': houseNumber,
                    'Phone1': phoneNumber,
                    'StreetName': streetName,
                },
                'NumberOfPackages': 1,
                'PaymentType': 'PP',
                'Reference1': orderId,
                'UseDefaultShipperAddress': 'true',
                'Weight': itemsTotalWeight
            }
        }
        insertShipmentFunction = 'InsertWbShipment';
    }

    const authCookieArray = authClient.lastResponseHeaders['set-cookie'][0].split(';');
    const authCookie = authCookieArray[0];

    const shippingClient = await soap.createClientAsync(webServiceShipUrl);
    const shippingClientFunction = new Promise(function(resolve) {
        shippingClient.addHttpHeader('Cookie', authCookie);
        shippingClient[insertShipmentFunction](functionArgs, function(err, result) {
            resolve(result[`${insertShipmentFunction}Result`]);
        });
    });

    const sendToUps = await shippingClientFunction;

    if(sendToUps === undefined || sendToUps.IsSucceeded === 'false'){
        return {'errors': sendToUps.LastError.OriginalMessage}
    }

    return { 'wayBillNumber': sendToUps.TrackingNumber };
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

            const orderName = getOrderJson.order.name.replace('#', '$');
            const orderTags = getOrderJson.order.tags;
            const errorsPrefix = `Cant send order ${orderName} to Ups - `;

            const orderPickupsData = await getOrderPickupsData(shop, orderId);
            if (orderPickupsData.orderSentToUps) {
                output += `Order ${orderName} Already Sent to Ups`;
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

            const {isLoggedIn, authClient} = await webServiceAuthLogin(integrationData);

            if (!isLoggedIn) {
                const error = 'WebService Auth Error';
                await saveOrderTagError(shop, orderId, orderTags, error);
                output += `${errorsPrefix} ${error}`;
                continue;
            }

            const upsData = await webServiceSendToUps(authClient, integrationData, getOrderJson, orderPickupsData);

            if (upsData.errors) {
                console.log('upsData.errors', upsData.errors);
                await saveOrderTagError(shop, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${upsData.errors}`;
                continue;
            }

            const wayBillNumber = upsData.wayBillNumber;

            const response = await saveWayBillNumberOnOrder(shop, orderId, wayBillNumber, orderTags);
            if (response.errors) {
                await saveOrderTagError(shop, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${response.errors}`;
                continue;
            }

            output += `Order ${orderName} Sent to UPS`;
        }
    }

    console.log('send-to-ups output: '+output);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.redirect(`/output?output=${output}&shop=${shop}`);
}
