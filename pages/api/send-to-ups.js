const { HOST } = process.env;
const { getReference2Field, saveOrderPickupPoint, getShippingData, getClosestPoints, orderClosestPointsWhileSendToUpsIsEnabled, updatedMetafields, saveOrderWeight, mergePdf, restApiPrintLabel, getFieldFromIntegrationData, getRestApiAccessToken, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, isPickUpsShippingMethod, getResponseJsonAndSaveLogs, getDate } = require('../../server/helper');

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
    let orderLeadId = '';
    getWaybillNumberJson.metafields.forEach((item) => {
        if(item.key === 'pickups_point_wb'){
            orderSentToUps = true;
        }
        if(item.key === 'pickups_point_lead_id'){
            orderLeadId = item.value
        }
        if(item.key === 'pickups_point_json'){
            orderPickupPoint = JSON.parse(item.value)
        }
    })

    return { 'orderSentToUps': orderSentToUps, 'orderPickupPoint': orderPickupPoint, 'orderLeadId': orderLeadId};
}

async function saveWayBillNumberOnOrder(shop, orderId, wayBillNumber, orderTags, orderWeight, additionalTags = null){
    const response = await fetch(`${HOST}api/save-order-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'wayBillNumber': wayBillNumber, 'orderTags': orderTags, 'orderWeight': orderWeight, 'additionalTags': additionalTags})
    });

    return await response.json();
}

async function saveLeadIdOnOrder(shop, orderId, leadId, orderTags, orderWeight){
    const response = await fetch(`${HOST}api/save-order-leadid`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'leadId': leadId, 'orderTags': orderTags})
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

async function restApiSendToUps(shop, accessToken, shippingData, integrationData, getOrderJson, orderPickupsData, orderTags){
    let apiHost = getFieldFromIntegrationData(integrationData,'upsApiCreateUrl');

    if(!apiHost || apiHost === 'X'){
        apiHost = 'https://plugins.ship.co.il/';
    }

    const apiUrl = apiHost + 'api/v1/shipment/insert-domestic-wb-by-customer';
    const customerEmail = getOrderJson.order.email;
    const customerName = getCustomerName(getOrderJson.order);
    const cityName = getOrderJson.order.shipping_address.city;
    const customerZipcode = getOrderJson.order.shipping_address.zip || '';
    let streetAddress = getOrderJson.order.shipping_address.address1;
    let roomNumber = '';
    if(getOrderJson.order.shipping_address.address2) {
        roomNumber = getOrderJson.order.shipping_address.address2;
        streetAddress += ' '+roomNumber;
    }
    const streetName = streetAddress;
    const houseNumber = getHouseNumber(roomNumber);

    const phoneNumber = getPhoneNumber(getOrderJson.order);
    const orderOriginalId = getOrderJson.order.id;
    const orderId = getOrderJson.order.name.substring(1);
    const shippingMethod = getOrderJson.order.shipping_lines[0].code;
    const itemsTotalWeight = getOrderWeight(integrationData, getOrderJson.order.line_items);

    const isPickups = isPickUpsShippingMethod(shippingMethod);
    const reference2Type = getFieldFromIntegrationData(integrationData,'upsIntegrationReference2');
    const reference2 = getReference2Field(reference2Type, getOrderJson.order, orderPickupsData, shippingData).substring(0, 36);
    const shipmentInstructions = streetAddress;

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
            'HouseNumber': '',
            'RoomNumber': houseNumber,
            'StreetName': streetName,
            'Phone1': validatePhoneNumber(phoneNumber),
            'Phone2': validatePhoneNumber(phoneNumber),
            'ZipCode': customerZipcode,
            'ContactEmail': customerEmail
        },
        'ShipmentInstructions': shipmentInstructions,
        'Reference1': orderId,
        'Reference2': reference2,
        'Weight': itemsTotalWeight,
        'UseDefaultShipperAddress': 'true'
    }

    let closestPointAccuracyLabel;
    if (isPickups) {
        let pickupPoint = getPickupPoint(orderPickupsData);
        let pickupPointId = pickupPoint['id'];

        if (!pickupPointId) {

            if(orderClosestPointsWhileSendToUpsIsEnabled(integrationData)){
                const customerShippingAddress = {
                    'city': cityName,
                    'address1': streetName,
                    'address2': houseNumber
                };
                const closestPoint = await getClosestPoints(shop, shippingData, customerShippingAddress, 1);

                console.log('closestPoint', closestPoint);
                if(closestPoint['errors']){
                    return {
                        'errors': closestPoint['errors']
                    }
                }else{
                    closestPointAccuracyLabel = closestPoint['accuracy']['label'];
                    pickupPointId = closestPoint['response'][0]['PointID']

                    pickupPoint = JSON.stringify({
                        "title": closestPoint['response'][0]['PointName'],
                        "street": closestPoint['response'][0]['StreetName']+' '+closestPoint['response'][0]['HouseNumber'],
                        "city": closestPoint['response'][0]['CityName'],
                        "iid": pickupPointId
                    })

                    try {
                        await saveOrderPickupPoint(shop, orderOriginalId, pickupPoint, false);
                    } catch (e) {
                        console.log(getDate()+' Error: '+e)
                    }
                }
            }

            if(!pickupPointId){
                return {
                    'errors': 'No Pickup Point Selected'
                }
            }
        }
        functionArgs['PickupPointID'] = pickupPointId;
    }

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(functionArgs)
    };

    let trackingNumber,leadId;
    try {
        const response = await fetch(apiUrl, requestOptions);

        const data = await getResponseJsonAndSaveLogs('restApiSendToUps', shop, apiUrl, requestOptions, response);

        if(!data){
            throw 'Api Return Empty Response';
        }

        if (data['Message'] || data['ErrorCode'] > 0 || data['ErrorCode'] === -1) {
            throw data['Message'] || data['ErrorMessage'];
        }

        if (data['LeadId']) {
            leadId = data['LeadId']
        } else {
            if (!data['TrackingNumber']) {
                throw 'Tracking Number Not Found';
            }
            trackingNumber = data['TrackingNumber'];
        }
    } catch (e) {
        console.log(getDate()+' restApiSendToUps apiUrl: ',apiUrl);
        console.log(getDate()+' restApiSendToUps requestOptions: ',requestOptions);
        console.log(getDate()+' restApiSendToUps Error: ',e);
        return { 'errors': e }
    }

    return { 'wayBillNumber': trackingNumber, 'leadId': leadId, 'closestPointAccuracyLabel': closestPointAccuracyLabel  };
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
    const printLabel = req.query.print_label === 'true';
    const format = req.query.format;
    let output = '';
    let pdfDownloadFile;

    if(!hmacVerified && verifyHmac(requestQuery, hmac, isBulkAction) === false){
        output = 'Auth Error';
    }

    if(output === '') {

        await updatedMetafields(shop);

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

            const orderName = getOrderJson.order.name;
            const orderTags = getOrderJson.order.tags;
            const errorsPrefix = `Cant send order ${orderName} to Ups - `;

            const orderPickupsData = await getOrderPickupsData(shop, orderId);
            if (orderPickupsData.orderSentToUps) {
                output += `Order ${orderName} Already Sent to Ups`;
                continue;
            }
            if (orderPickupsData.orderLeadId) {
                output += `Lead already created for order ${orderName}`;
                continue;
            }

            const shippingData = await getShippingData(shop);
            if(shippingData['error']){
                output += `${errorsPrefix} ${shippingData['message']}`;
                continue;
            }
            const integrationData = shippingData.metafields.filter((item) => item.namespace === 'pickups-integration');
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
            const upsData = await restApiSendToUps(shop, accessToken, shippingData, integrationData, getOrderJson, orderPickupsData, orderTags);

            if (upsData.errors) {
                console.log('upsData.errors', upsData.errors);
                await saveOrderTagError(shop, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${upsData.errors}`;
                continue;
            }

            const orderWeight = getOrderWeight(integrationData, getOrderJson.order.line_items);

            await saveOrderWeight(shop, orderId, orderWeight);

            if(upsData.leadId) {
                const leadId = upsData.leadId;

                const response = await saveLeadIdOnOrder(shop, orderId, leadId, orderTags, orderWeight);
                if (response.errors) {
                    await saveOrderTagError(shop, orderId, orderTags, upsData.errors);
                    output += `${errorsPrefix} ${response.errors}`;
                    continue;
                }

                output += `Order ${orderName} Sent - New lead created `;
            }else{
                const wayBillNumber = upsData.wayBillNumber;

                const response = await saveWayBillNumberOnOrder(shop, orderId, wayBillNumber, orderTags, orderWeight, upsData.closestPointAccuracyLabel);
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

                if(printLabel){
                    const {isLoggedIn, accessToken} = await getRestApiAccessToken(integrationData, 'print');
                    if (!isLoggedIn) {
                        output += `${errorsPrefix} Print API Auth Error`;
                        continue;
                    }

                    const upsPrintLabel = await restApiPrintLabel(accessToken, integrationData, wayBillNumber, format);

                    if (upsPrintLabel.errors) {
                        output += `${errorsPrefix} ${upsPrintLabel.errors}`;
                        continue;
                    }

                    pdfList.push(upsPrintLabel.response);
                }
            }
        }

        if (pdfList.length > 0) {
            const pdfMergeResponse = await mergePdf(pdfList, format);
            pdfDownloadFile = pdfMergeResponse['pdfDownloadFile'];
            output += '<br/>'+pdfMergeResponse['output'];
        }
    }

    const backButtonText = isBulkAction ? 'Back to my orders' : 'Back to my order';
    let messageContent = output;
    let outputScripts = '';
    if(pdfDownloadFile){
        messageContent += `<br/>You can also <a href="${pdfDownloadFile}" target="_blank">Click Here to open label</a>`;
        outputScripts = `<script>setTimeout(function(){ const newTab = window.open('${pdfDownloadFile}', '_blank'); if(newTab !== null){ newTab.focus(); } }, 3000)</script>`;
    }

    const outputHtml = `${outputScripts}<link rel="stylesheet" href="../api-output.css"><div class="message-container"><div class="message-wrapper">${messageContent}</div><button onClick="window.history.back();">${backButtonText}</button></div>`;

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html');
    res.end(outputHtml);
}
