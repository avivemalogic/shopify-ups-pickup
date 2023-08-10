const { HOST } = process.env;
const { updatedMetafields, getAccessToken, getFieldFromIntegrationData, getRestApiAccessToken, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, getDate, getOrderPickupsData, saveOrderTagError, saveWayBillNumberOnOrder, fullfillOrderItems, isFulfillOrderItemsEnabled, isFulfillOrderItemsCustomerNotify } = require('../../server/helper');

async function restApiImportWaybillFromLeadId(accessToken, apiAccessToken, integrationData, getOrderJson, orderPickupsData){

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
            'Authorization': 'Bearer ' + apiAccessToken
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
        console.log(getDate()+' restApiImportWaybillFromLeadId Error: ',e);
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
    let output = '';

    if(!hmacVerified && verifyHmac(requestQuery, hmac, isBulkAction) === false){
        output = 'Auth Error';
    }

    if(output === '') {

        const accessToken = await getAccessToken(shop);

        await updatedMetafields(shop, accessToken);

        if (Array.isArray(orderIds) === false) {
            orderIds = [orderIds];
        }

        for (let i = 0, orderIdsLength = orderIds.length; i < orderIdsLength; ++i) {
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
            const errorsPrefix = `Cant import waybill for order ${orderName} - `;

            const orderPickupsData = await getOrderPickupsData(shop, accessToken, orderId);
            if (orderPickupsData.orderSentToUps) {
                output += `Order ${orderName} Already Sent to Ups`;
                continue;
            }

            if(!orderPickupsData.orderLeadId){
                output += `Lead Id not found for order ${orderName}`;
                continue;
            }

            const integrationData = await getIntegrationData(shop, accessToken);
            if(integrationData['error']){
                output += `${errorsPrefix} ${integrationData['message']}`;
                continue;
            }
            if (!orderIntegrationIsEnabled(integrationData)) {
                const error = 'Order Integration setting is Disabled';
                await saveOrderTagError(shop, accessToken, orderId, orderTags, error);
                output += `${errorsPrefix} ${error}`;
                continue;
            }

            const { isLoggedIn, apiAccessToken } = await getRestApiAccessToken(integrationData ,'create');
            if (!isLoggedIn) {
                const error = 'Rest API Auth Error';
                await saveOrderTagError(shop, accessToken, orderId, orderTags, error);
                output += `${errorsPrefix} ${error}`;
                continue;
            }
            const upsData = await restApiImportWaybillFromLeadId(accessToken, apiAccessToken, integrationData, getOrderJson, orderPickupsData);

            if (upsData.errors) {
                console.log('upsData.errors', upsData.errors);
                await saveOrderTagError(shop, accessToken, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${upsData.errors}`;
                continue;
            }

            const wayBillNumber = upsData.wayBillNumber;
            const orderWeight = orderPickupsData.orderWeight;

            const response = await saveWayBillNumberOnOrder(shop, accessToken, orderId, wayBillNumber, orderTags, orderWeight);
            if (response.errors) {
                await saveOrderTagError(shop, accessToken, orderId, orderTags, upsData.errors);
                output += `${errorsPrefix} ${response.errors}`;
                continue;
            }

            output += `Order ${orderName} Sent to UPS `;

            if(isFulfillOrderItemsEnabled(integrationData)) {
                const fulfillResponse = await fullfillOrderItems(shop, accessToken, orderId, wayBillNumber, isFulfillOrderItemsCustomerNotify(integrationData));
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
