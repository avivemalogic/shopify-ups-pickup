const { HOST } = process.env;
const soap = require('soap');
const fs = require('fs');
const open = require('open');
const { PDFDocument } = require('pdf-lib');
const { webServiceAuthLogin, getIntegrationData, getOrderData, orderIntegrationIsEnabled, verifyHmac } = require('../../server/helper');

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
        console.log('getWayBillNumber Error: ', e);
        return '';
    }
}

async function webServicePrintLabel(authClient, integrationData, wayBillNumber, format){
    const webServiceShipUrl = integrationData.find((item) => item.key === 'webServiceShipUrl').value;
    const insertShipmentFunction = 'GetThermalLabelEX';
    const functionArgs = {
        'criteria': {
            'TrackingNumber': wayBillNumber,
            'Type': 'Hebrew',
            'AutoPrint': 1,
            'Copies': 1,
            'LabelFormat': format === 'A4' ? 'A4' : 'Thermal',
        }
    };

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

    return { 'response': sendToUps.File };
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

            const errorsPrefix = `Cant send order ${orderName} to Ups - `;

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

            const {isLoggedIn, authClient} = await webServiceAuthLogin(integrationData);

            if (!isLoggedIn) {
                output += `${errorsPrefix} WebService Auth Error`;
                continue;
            }

            const upsData = await webServicePrintLabel(authClient, integrationData, wayBillNumber, format);

            if (upsData.errors) {
                output += `${errorsPrefix} ${upsData.errors}`;
                continue;
            }

            pdfList.push(upsData.response);

        }

        if (pdfList.length > 0) {
            let pdfFinal,
                pdfEncodingType;
            if (pdfList.length > 1) {
                const mergedPdf = await PDFDocument.create();
                for (const item of pdfList) {
                    const itemBuffer = Buffer.from(item, 'base64');
                    const pdfBytes = new Uint8Array(itemBuffer);
                    const pdf = await PDFDocument.load(pdfBytes);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => {
                        mergedPdf.addPage(page);
                    });
                }

                pdfFinal = await mergedPdf.save();
                pdfEncodingType = 'uint8';
            } else {
                pdfFinal = pdfList[0];
                pdfEncodingType = 'base64';
            }

            const pdfFile = Buffer.from(pdfFinal, pdfEncodingType);

            const pdfDir = 'ups-labels';
            const serverPdfDir = `./public/${pdfDir}`;
            const uniqueId = Date.now() * 123
            const pdfFilename = `ups_${format.toLowerCase()}_${uniqueId}.pdf`;

            if (!fs.existsSync(serverPdfDir)){
                fs.mkdirSync(serverPdfDir);
            }

            fs.writeFileSync(`${serverPdfDir}/${pdfFilename}`, pdfFile,'binary');

            res.statusCode = 200;
            output = 'Your Label will be open in a few seconds...';
            pdfDownloadFile = `${HOST}${pdfDir}/${pdfFilename}`;
        }
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.redirect(`/output?output=${output}&shop=${shop}&file=${pdfDownloadFile}`);
}
