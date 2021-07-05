const { HOST } = process.env;
const { mergePdf, restApiPrintLabel, getFieldFromIntegrationData, getRestApiAccessToken, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, isPickUpsShippingMethod } = require('../../server/helper');

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
    return !!validatePhoneNumber(phoneNumber);
}

function validatePhoneNumber(phoneNumber){
    try {
        return phoneNumber.replace(' ', '').replace('+972', '0').replace(/-/g, '').match(/^0(5[^7])[0-9]{7}$/)[0];
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

async function restApiSendToUps(accessToken, integrationData, getOrderJson, orderPickupsData){
    let apiUrl = getFieldFromIntegrationData(integrationData,'upsApiUrl') + 'api/v1/shipments/';
    const customerEmail = getOrderJson.order.email;
    const customerName = `${getOrderJson.order.shipping_address.first_name} ${getOrderJson.order.shipping_address.last_name}`;
    const cityName = getOrderJson.order.shipping_address.city;
    const customerZipcode = getOrderJson.order.shipping_address.zip;
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

    if(!isValidPhoneNumber(phoneNumber)){
        return {
            'errors': 'Phone Number is invalid'
        }
    }

    let functionArgs = {
        'NumberOfPackages': 1,
        'ConsigneeAddress': {
            'ContactPerson': customerName,
            'CustomerName': customerName,
            'CityName': cityName,
            'HouseNumber': houseNumber,
            'StreetName': streetName,
            'ZipCode': customerZipcode,
            'ContactEmail': customerEmail
        },
        'Reference1': orderId,
        'Weight': itemsTotalWeight,
        'UseDefaultShipperAddress': 'true'
    }

    if(isPickups) {
        apiUrl += 'insert-pickup-shipment-ex';
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

        functionArgs['PickupPointID'] = pickupPointId;
        functionArgs['ConsigneeAddress']['Phone1'] = validatePhoneNumber(phoneNumber);
    }else {
        apiUrl += 'insert-shipment-ex';
        const splitPhoneNumber = splitPhonePrefix(phoneNumber);
        functionArgs['PaymentType'] = 'PP';

        functionArgs['ConsigneeAddress']['PhonePrefix'] = splitPhoneNumber['prefix'];
        functionArgs['ConsigneeAddress']['Phone'] = splitPhoneNumber['number'];
    }

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(functionArgs)
    };

    let trackingNumber;
    try {
        const response = await fetch(apiUrl, requestOptions);
        const data = await response.json();

        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['Message'] || data['Result']['ErrorCode'] > 0){
            throw data['Message'] || data['Result']['ErrorMessage'];
        }

        if(!data['Result']['TrackingNumber']){
            throw 'Tracking Number Not Found';
        }
        trackingNumber = data['Result']['TrackingNumber'];
    } catch (e) {
        console.log('restApiSendToUps Error: ',e);
        return { 'errors': e }
    }

    return { 'wayBillNumber': trackingNumber };
}

export default async (req, res) => {
    const shop = req.query.shop;
    const hmac = req.query.hmac;
    const hmacVerified = req.query.automatic;
    const isBulkAction = req.query['ids[]'] !== undefined;
    let orderIds = isBulkAction ? req.query['ids[]'] : req.query.id;
    const requestQuery = req.query;
    const printLabel = req.query.print_label === 'true';
    const format = req.query.format;
    let output = '';
    let pdfDownloadFile;


    if(!hmacVerified && verifyHmac(requestQuery, hmac, isBulkAction) === false){
        output = 'Auth Error';
    }

    if(output === '') {

        if (Array.isArray(orderIds) === false) {
            orderIds = [orderIds];
        }

        let pdfList = [];
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

            const { isLoggedIn, accessToken } = await getRestApiAccessToken(integrationData);
            if (!isLoggedIn) {
                const error = 'Rest API Auth Error';
                await saveOrderTagError(shop, orderId, orderTags, error);
                output += `${errorsPrefix} ${error}`;
                continue;
            }
            const upsData = await restApiSendToUps(accessToken, integrationData, getOrderJson, orderPickupsData);

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

            if(printLabel){
                const upsPrintLabel = await restApiPrintLabel(accessToken, integrationData, wayBillNumber, format);

                if (upsPrintLabel.errors) {
                    output += `${errorsPrefix} ${upsPrintLabel.errors}`;
                    continue;
                }

                pdfList.push(upsPrintLabel.response);
            }
        }

        if (pdfList.length > 0) {
            const pdfMergeResponse = await mergePdf(pdfList, format);
            pdfDownloadFile = pdfMergeResponse['pdfDownloadFile'];
            output = pdfMergeResponse['output'];
        }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');

    if(pdfDownloadFile) {
        res.redirect(`/output?output=${output}&shop=${shop}&file=${pdfDownloadFile}`);
    }else {
        res.redirect(`/output?output=${output}&shop=${shop}`);
    }
}
