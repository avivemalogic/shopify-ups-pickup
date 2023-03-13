const { HOST } = process.env;
const { sleep, updatedMetafields, mergePdf, restApiPrintLabel, getRestApiAccessToken, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac, getDate } = require('../../server/helper');

async function getWayBillNumber(shop, orderId){
    const getWaybillNumberResponse = await fetch(`${HOST}api/get-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });

    if(getWaybillNumberResponse.status !== 200){
        return '';
    }

    try {
        const getWaybillNumberJson = await getWaybillNumberResponse.json();

        let wayBillNumber = '';
        getWaybillNumberJson.metafields.forEach((item) => {
            if(item.key === 'pickups_point_wb'){
                wayBillNumber = item.value;
            }
        })

        return wayBillNumber;
    } catch (e){
        console.log(getDate()+' getWayBillNumber Error: ', e);
        return '';
    }
}

export default async (req, res) => {
    const shop = req.query.shop;
    const hmac = req.query.hmac;
    const format = req.query.format;
    const isBulkAction = req.query['ids[]'] !== undefined;
    let orderIds = isBulkAction ? req.query['ids[]'] : req.query.id;
    const requestQuery = req.query;
    let output = '';
    let pdfDownloadFile = '';

    if(verifyHmac(requestQuery, hmac, isBulkAction) === false){
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

            const errorsPrefix = `Cant print order ${orderName} - `;

            const wayBillNumber = await getWayBillNumber(shop, orderId);

            if (!wayBillNumber) {
                output += `${errorsPrefix} WaybillNumber Not Found`;
                continue;
            }

            const integrationData = await getIntegrationData(shop);
            if(integrationData['error']){
                output += `${errorsPrefix} ${integrationData['message']}`;
                continue;
            }
            if (!orderIntegrationIsEnabled(integrationData)) {
                output += `${errorsPrefix} Order Integration setting is Disabled`;
                continue;
            }

            const {isLoggedIn, accessToken} = await getRestApiAccessToken(integrationData, 'print');
            if (!isLoggedIn) {
                output += `${errorsPrefix} REST API Auth Error`;
                continue;
            }
            const upsData = await restApiPrintLabel(accessToken, integrationData, wayBillNumber, format);

            if (upsData.errors) {
                output += `${errorsPrefix} ${upsData.errors}`;
                continue;
            }

            pdfList.push(upsData.response);

            await sleep();
        }

        if (pdfList.length > 0) {
            const pdfMergeResponse = await mergePdf(pdfList, format);
            pdfDownloadFile = pdfMergeResponse['pdfDownloadFile'];
            output += pdfMergeResponse['output'];
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
