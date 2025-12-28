const { isShippingMethodAllowCreateWaybill, getOrderAdditionalInfo, getNumberOfPackages, validatePhoneNumber, getOrderPhoneNumber, getOrderCustomerName, sleep, getPickupPoint, getReference2Field, saveOrderPickupPoint, getShippingData, getClosestPoints, orderClosestPointsWhileSendToUpsIsEnabled, updatedMetafields, saveOrderWeight, mergePdf, restApiPrintLabel, getFieldFromIntegrationData, getRestApiAccessToken, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, isPickUpsShippingMethod, getResponseJsonAndSaveLogs, getDate, getAccessToken, getOrderPickupsData, saveOrderTagError, getOrderWeight, saveWayBillNumberOnOrder, saveLeadIdOnOrder, fullfillOrderItems, isFulfillOrderItemsEnabled, isFulfillOrderItemsCustomerNotify, isValidExportOrder, convertToExportFormat, getValidationErrorsArray, isExportOrder } = require('../../server/helper');

function getHouseNumber(streetAddress) {
    const houseNumber = streetAddress.match(/[0-9]+/g);
    if (houseNumber !== null) {
        return houseNumber[0];
    }
    return '';
}

function isValidPhoneNumber(isExportOrderCondition, phoneNumber){
    if(!phoneNumber) return false;
    return !!validatePhoneNumber(phoneNumber, isExportOrderCondition);
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

async function restApiSendToUps(shop, accessToken, apiAccessToken, shippingData, integrationData, getOrderJson, orderPickupsData, orderTags){
    let apiHost = getFieldFromIntegrationData(integrationData,'upsApiCreateUrl');

    if(!apiHost || apiHost === 'X'){
        apiHost = 'https://plugins.ship.co.il/';
    }

    const isExportOrderCondition = isExportOrder(getOrderJson.order);
    let apiPath = 'api/v1/shipment/insert-domestic-wb-by-customer';
    if(isExportOrderCondition){
        apiPath = 'api/v1/export/insert-lead-by-customer';
    }
    const apiUrl = apiHost + apiPath;
    const customerEmail = getOrderJson.order.email;
    const customerName = getOrderCustomerName(getOrderJson.order);
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

    const phoneNumber = getOrderPhoneNumber(getOrderJson.order);
    const orderOriginalId = getOrderJson.order.id;
    const orderId = getOrderJson.order.name.substring(1);
    const shippingMethod = getOrderJson.order.shipping_lines[0].code;
    const itemsTotalWeight = getOrderWeight(integrationData, getOrderJson.order.line_items);

    const isPickups = isPickUpsShippingMethod(shippingMethod);

    if(!isShippingMethodAllowCreateWaybill(shippingMethod, integrationData)){
        return {
            'errors': 'This shipping method is not allowed to create waybill',
            'save': false
        }
    }

    const reference2Type = getFieldFromIntegrationData(integrationData,'upsIntegrationReference2');
    const reference2 = getReference2Field(reference2Type, getOrderJson.order, orderPickupsData, shippingData).substring(0, 36);
    const shipmentInstructions = streetAddress;

    const orderAdditionalInfo = await getOrderAdditionalInfo(shop, accessToken, orderOriginalId);
    const customerType = shippingData['customerType'] || null;

    if (!isValidPhoneNumber(isExportOrderCondition, phoneNumber)) {
        return {
            errors: 'Phone Number is invalid'
        };
    }

    let functionArgs = {
        'NumberOfPackages': getNumberOfPackages(orderAdditionalInfo, customerType),
        'ConsigneeAddress': {
            'ContactPerson': customerName,
            'CustomerName': customerName,
            'CityName': cityName,
            'HouseNumber': '',
            'RoomNumber': houseNumber,
            'StreetName': streetName,
            'Phone1': validatePhoneNumber(phoneNumber, isExportOrderCondition),
            'Phone2': validatePhoneNumber(phoneNumber, isExportOrderCondition),
            'ZipCode': customerZipcode,
            'ContactEmail': customerEmail
        },
        'ShipmentInstructions': shipmentInstructions,
        'Reference1': orderId,
        'Reference2': reference2,
        'Weight': itemsTotalWeight,
        'UseDefaultShipperAddress': 'true',
        'ProcessName': 11
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
                        await saveOrderPickupPoint(shop, accessToken, orderOriginalId, pickupPoint, getOrderJson, false);
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
    }else{
        Object.entries(orderAdditionalInfo).forEach(entry => {
            const [key, value] = entry;
            if(value === ''){
                return;
            }
            if(key === 'orderIsDDO'){
                functionArgs['IsDDO'] = !!value;
            }
            if(key === 'orderCODDetails'){
                functionArgs['CODDetails'] = value;
            }
            if(key === 'orderCODValue'){
                functionArgs['CODValue'] = value;
            }
            if(key === 'orderIsUDR'){
                functionArgs['IsUDR'] = !!value;
            }
            if(key === 'orderIsReturn'){
                functionArgs['IsReturn'] = !!value;
            }
        })
    }

    const exportValidation = isValidExportOrder(
        getOrderJson.order,
        integrationData,
        shippingData
    );

    if (exportValidation.error) {
        return {
            errors: exportValidation.error
        };
    }

    if (exportValidation.isValid) {
        functionArgs = convertToExportFormat(functionArgs, getOrderJson.order);
    }

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiAccessToken
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

        const errorsArray = getValidationErrorsArray(data);
        if (errorsArray.length > 0) {
            throw errorsArray.join(', ');
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

        const accessToken = await getAccessToken(shop);

        await updatedMetafields(shop, accessToken);

        if (Array.isArray(orderIds) === false) {
            orderIds = [orderIds];
        }

        let pdfList = [];
        const orderIdsLength = orderIds.length

        if (orderIdsLength >= 8) {
            output += "You can only create a waybill for up to 7 orders at a time.";
        } else {
            for (let i = 0; i < orderIdsLength; ++i) {
                const orderId = orderIds[i];

                if (output !== '') {
                    output += '<br />';
                }
                const getOrderJson = await getOrderData(shop, accessToken, orderId);
                if (getOrderJson.errors) {
                    output += `${getOrderJson.errors}`;
                    continue;
                }

                const orderName = getOrderJson.order.name;
                const orderTags = getOrderJson.order.tags;
                const errorsPrefix = `Cant send order ${orderName} to Ups - `;

                const orderPickupsData = await getOrderPickupsData(shop, accessToken, orderId);
                if (orderPickupsData.orderSentToUps) {
                    output += `Order ${orderName} Already Sent to Ups`;
                    continue;
                }
                if (orderPickupsData.orderLeadId) {
                    output += `Lead already created for order ${orderName}`;
                    continue;
                }

                const shippingData = await getShippingData(shop, accessToken, true);
                if (shippingData['error']) {
                    output += `${errorsPrefix} ${shippingData['message']}`;
                    continue;
                }
                const integrationData = shippingData.metafields.filter((item) => item.namespace === 'pickups-integration');
                if (!orderIntegrationIsEnabled(integrationData)) {
                    const error = 'Order Integration setting is Disabled';
                    await saveOrderTagError(shop, accessToken, orderId, orderTags, error);
                    output += `${errorsPrefix} ${error}`;
                    continue;
                }

                const {isLoggedIn, apiAccessToken} = await getRestApiAccessToken(integrationData, 'create');
                if (!isLoggedIn) {
                    const error = 'Rest API Auth Error';
                    await saveOrderTagError(shop, accessToken, orderId, orderTags, error);
                    output += `${errorsPrefix} ${error}`;
                    continue;
                }

                const upsData = await restApiSendToUps(shop, accessToken, apiAccessToken, shippingData, integrationData, getOrderJson, orderPickupsData, orderTags);

                if (upsData.errors) {
                    console.log('upsData.errors', upsData.errors);
                    if (upsData.save !== false) {
                        await saveOrderTagError(shop, accessToken, orderId, orderTags, upsData.errors);
                    }
                    output += `${errorsPrefix} ${upsData.errors}`;
                    continue;
                }

                const orderWeight = getOrderWeight(integrationData, getOrderJson.order.line_items);

                await saveOrderWeight(shop, accessToken, orderId, orderWeight);

                if (upsData.leadId) {
                    const leadId = upsData.leadId;

                    const response = await saveLeadIdOnOrder(shop, accessToken, orderId, leadId, orderTags, orderWeight);
                    if (response.errors) {
                        await saveOrderTagError(shop, accessToken, orderId, orderTags, upsData.errors);
                        output += `${errorsPrefix} ${response.errors}`;
                        continue;
                    }

                    output += `Order ${orderName} Sent - New lead created `;
                } else {
                    const wayBillNumber = upsData.wayBillNumber;

                    const response = await saveWayBillNumberOnOrder(shop, accessToken, orderId, wayBillNumber, orderTags, orderWeight, upsData.closestPointAccuracyLabel);
                    if (response.errors) {
                        await saveOrderTagError(shop, accessToken, orderId, orderTags, upsData.errors);
                        output += `${errorsPrefix} ${response.errors}`;
                        continue;
                    }

                    output += `Order ${orderName} Sent to UPS `;

                    if (isFulfillOrderItemsEnabled(integrationData)) {
                        const fulfillResponse = await fullfillOrderItems(shop, accessToken, orderId, wayBillNumber, isFulfillOrderItemsCustomerNotify(integrationData));

                        if (fulfillResponse.errors) {
                            output += `<br /> ${fulfillResponse.errors}`;
                        }
                    }

                    if (printLabel) {
                        const {isLoggedIn, apiAccessToken} = await getRestApiAccessToken(integrationData, 'print');
                        if (!isLoggedIn) {
                            output += `${errorsPrefix} Print API Auth Error`;
                            continue;
                        }

                        const upsPrintLabel = await restApiPrintLabel(accessToken, apiAccessToken, integrationData, wayBillNumber, format);

                        if (upsPrintLabel.errors) {
                            output += `${errorsPrefix} ${upsPrintLabel.errors}`;
                            continue;
                        }

                        pdfList.push(upsPrintLabel.response);
                    }
                }

                if (orderIdsLength - 1 > i) {
                    await sleep();
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
