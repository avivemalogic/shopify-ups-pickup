const { HOST } = process.env;
const { updatedMetafields, getFieldFromIntegrationData, getAccessToken, isGetWaybillStatusEnabled, getRestApiAccessToken, getIntegrationData, getOrderData, formatDate, verifyHmac, getDate, getOrderPickupsData, saveOrderTag } = require('../../server/helper');

async function restApiGetWaybillStatus(accessToken, apiAccessToken, integrationData, orderPickupsData){
    let apiHost = getFieldFromIntegrationData(integrationData,'upsApiUrl');

    const apiUrl = apiHost + 'api/v1/shipments/wb-status';
    const orderWaybillNumber = orderPickupsData.orderWaybillNumber;

    let functionArgs = {
        'trackingNumber': orderWaybillNumber
    }

    const params = new URLSearchParams(functionArgs).toString();

    const requestOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiAccessToken
        }
    };

    let waybillStatus;
    try {
        const response = await fetch(apiUrl+'?'+params, requestOptions);

        console.log('url', apiUrl+'?'+params)
        console.log('requestOptions', requestOptions)
        console.log('response', response)

        const data = await response.json();

        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['Message'] || data['ErrorCode'] > 0){
            throw data['Message'] || data['ErrorMessage'];
        }

        waybillStatus = data['Status'];

        if (!waybillStatus) {
            throw 'Waybill Status Not Found';
        }

    } catch (e) {
        console.log(getDate()+' restApiGetWaybillStatus Error: ',e);
        return { 'errors': e }
    }

    return { 'waybillStatus': waybillStatus };
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
            const errorsPrefix = `Cant get waybill waybill for order ${orderName} - `;

            const orderPickupsData = await getOrderPickupsData(shop, accessToken, orderId);
            if (!orderPickupsData.orderWaybillNumber) {
                output += `Order ${orderName} Doesnt have Waybill`;
                continue;
            }

            const integrationData = await getIntegrationData(shop, accessToken);
            if(integrationData['error']){
                output += `${errorsPrefix} ${integrationData['message']}`;
                continue;
            }
            if (!isGetWaybillStatusEnabled(integrationData)) {
                const error = 'Get waybill status setting is Disabled';
                output += `${errorsPrefix} ${error}`;
                continue;
            }

            const { isLoggedIn, apiAccessToken } = await getRestApiAccessToken(integrationData ,'print');
            if (!isLoggedIn) {
                const error = 'Rest API Auth Error';
                output += `${errorsPrefix} ${error}`;
                continue;
            }
            const upsData = await restApiGetWaybillStatus(apiAccessToken, apiAccessToken, integrationData, orderPickupsData);

            if (upsData.errors || !upsData.waybillStatus) {
                console.log('upsData.errors', upsData.errors);
                output += `${errorsPrefix} עוד אין מידע על משלוח זה, יש לנסות מאוחר יותר`;
                continue;
            }
            const waybillStatusPrefixTag = 'סטטוס משלוח:';
            await saveOrderTag(shop, accessToken, orderId, orderTags, waybillStatusPrefixTag+upsData.waybillStatus, waybillStatusPrefixTag);
            const newOrderTags = `${orderTags}, ${waybillStatusPrefixTag} ${upsData.waybillStatus}`;
            await saveOrderTag(shop, accessToken, orderId, newOrderTags, `${waybillStatusPrefixTag} נכון ל ${formatDate(new Date())}`);

            output = upsData.waybillStatus;
        }

    }

    const backButtonText = isBulkAction ? 'Back to my orders' : 'Back to my order';
    const messageContent = output;

    const outputHtml = `<meta charset="UTF-8"><link rel="stylesheet" href="../api-output.css"><div class="message-container"><div class="message-wrapper right">${messageContent}</div><button onClick="window.history.back();">${backButtonText}</button></div>`;

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html');
    res.end(outputHtml);
}
