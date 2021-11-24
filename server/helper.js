require("dotenv").config();
const { HOST, SHOPIFY_API_SECRET_KEY, API_VERSION, DEBUG_MODE } = process.env;
const crypto = require('crypto');
const querystring = require('querystring');
const DB_URL = 'http://api-shopify.emalogic.com';
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');


function getShopifyRequestHeaders(accessToken){
    return {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
    };
}

function orderIntegrationIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'enableOrderIntegration' && item.value === 'true')
}

function orderAutomaticSendIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'orderIntegrationAutomatic' && item.value === 'true')
}

function orderClosestPointsWhileSendToUpsIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'orderIntegrationClosestPoints' && item.value === 'true')
}

function isPickUpsShippingMethod(shippingMethod){
    return shippingMethod.includes('Access Points UPS') || shippingMethod.includes('UPS PickUp') || shippingMethod.includes('pickups_')
}

async function getShippingData(shop){
    const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'isPrivate': true})
    });
    try {
        return await shippingDataResponse.json();
    } catch (e) {
        console.log('getShippingData Error:', e);
        return {'error': true, 'message': 'getShippingData Error:'+e };
    }
}

async function getIntegrationData(shop){
    try {
        const shippingDataJson = await getShippingData(shop);
        return shippingDataJson.metafields.filter((item) => item.namespace === 'pickups-integration');
    } catch (e) {
        console.log('getIntegrationData Error:', e);
        return {'error': true, 'message': 'getIntegrationData Error:'+e };
    }
}

async function getOrderData(shop, orderId){
    const getOrderResponse = await fetch(`${HOST}api/get-order`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });
    if(getOrderResponse.status !== 200){
        return {'errors': `${getOrderResponse.status} - ${getOrderResponse.statusText}`}
    }
    try {
        return await getOrderResponse.json();
    } catch (e) {
        console.log('getOrderData Error: ', e);
        return {'errors': 'getOrderData Error: '+e };
    }
}

async function saveOrderNote(shop, orderId){
    const saveOrderNoteResponse = await fetch(`${HOST}api/save-order-note`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });
    if(saveOrderNoteResponse.status !== 200){
        return {'errors': `${saveOrderNoteResponse.status} - ${saveOrderNoteResponse.statusText}`}
    }
    try {
        return await saveOrderNoteResponse.json();
    } catch (e) {
        console.log('saveOrderNoteData Error: ', e);
        return {'errors': 'saveOrderNoteData Error: '+e };
    }
}

async function saveOrderPickupPoint(shop, orderId, pickupPoint, autoSend = false){

    const saveOrderPickupPointResponse = await fetch(`${HOST}api/save-order-pickup-point`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'pickupPoint': pickupPoint, 'autoSend': autoSend})
    });

    if(saveOrderPickupPointResponse.status !== 200){
        return {'errors': `${saveOrderPickupPointResponse.status} - ${saveOrderPickupPointResponse.statusText}`}
    }
    try {
        await saveOrderPickupPointResponse.json();
    } catch (e) {
        console.log('saveOrderPickupPointData Error: ', e);
        return {'errors': 'saveOrderPickupPointData Error: '+e };
    }
}

async function autoSendToUps(shop, orderId){
    const integrationData = await getIntegrationData(shop);

    if (!integrationData['error'] && orderIntegrationIsEnabled(integrationData) && orderAutomaticSendIsEnabled(integrationData)) {
        try {
            await fetch(`${HOST}api/send-to-ups?shop=${shop}&id=${orderId}&automatic=true`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
        } catch (e) {
            console.log(e);
        }
    }
}

function getFieldFromIntegrationData(integrationData, fieldKey){
    try {
        return integrationData.find((item) => item.key === fieldKey).value;
    } catch (e){
        return undefined;
    }
}

async function getRestApiAccessToken(integrationData, type){
    const apiType = type === 'create' ? 'upsApiCreateUrl' : 'upsApiUrl';
    let apiHost = getFieldFromIntegrationData(integrationData,apiType);

    if(!apiHost || apiHost === 'X'){
        if(type === 'create'){
            apiHost = 'https://plugins.ship.co.il/';
        }else {
            return {
                'errors': 'REST Create Api URL is empty'
            }
        }
    }

    const apiUrl = apiHost + 'Token';
    const apiUsername = getFieldFromIntegrationData(integrationData,'upsIntegrationUsername');
    const apiPassword = getFieldFromIntegrationData(integrationData,'upsIntegrationPassword');
    const apiScope = getFieldFromIntegrationData(integrationData,'upsIntegrationScope');

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    const urlencoded = new URLSearchParams();
    urlencoded.append("username", apiUsername);
    urlencoded.append("password", apiPassword);
    urlencoded.append("scope", apiScope);
    urlencoded.append("grant_type", "password");

    const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: urlencoded,
        redirect: 'follow'
    };

    try {
        const response = await fetch(apiUrl, requestOptions);
        const data = await response.json();

        if(data['error']){
            throw data['error'] +' - '+data['error_description'];
        }

        const accessToken = data['access_token'];

        return {
            'isLoggedIn': !!accessToken,
            'accessToken': accessToken
        }
    } catch (e) {
        console.log('getRestApiAccessToken Error: ',e);
        return {'isLoggedIn': false, 'accessToken': false };
    }
}

async function restApiPrintLabel(accessToken, integrationData, wayBillNumber, format){
    const apiUrl = getFieldFromIntegrationData(integrationData,'upsApiUrl') + 'api/v1/shipments/PrintWBOrderDetails';
    const functionArgs = {
        'trackingNumbers': wayBillNumber,
        'isA4Format': format === 'A4' ? 'True' : 'False',
        'printPickingList': 'false'
    };

    const urlParams = new URLSearchParams(functionArgs);

    const requestOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };

    try {
        const response = await fetch(apiUrl +'?'+ urlParams, requestOptions);
        const data = await response.text();

        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['Message']){
            throw data['Message'] || data['Result']['ErrorMessage'];
        }

        return { 'response': data };

    } catch (e) {
        console.log('restApiPrintLabel Error: ',e);
        return { 'errors': e }
    }
}

async function mergePdf(pdfList, format){
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

    return {
        'output': 'Your Label will be open in a few seconds...',
        'pdfDownloadFile': `${HOST}${pdfDir}/${pdfFilename}`
    }
}

function verifyHmac(requestQuery, hmac, isBulkAction){
    delete requestQuery['hmac'];
    let bodyString = '';

    if(isBulkAction){
        const ids = requestQuery['ids[]'];

        const idsList = Array.isArray(ids) ? ids.join('", "') : ids;

        const format = requestQuery['format'];
        if(format) {
            delete requestQuery['format'];
            bodyString += `format=${format}&`;
        }

        bodyString += `host=${requestQuery['host']}&`;
        delete requestQuery['host'];

        bodyString += `ids=["${idsList}"]&`;

        delete requestQuery['ids[]'];
    }

    bodyString += querystring.stringify(requestQuery);

    const generatedHash = crypto
        .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
        .update(bodyString)
        .digest('hex')

    return generatedHash === hmac;
}

async function verifyHmacWebhook(rawBody, hmac){
    try {
        const generatedHash = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
            .update(rawBody)
            .digest('base64');
        return generatedHash === hmac;
    } catch(e){
        console.log('rawBodyError', e);
    }

    return false;
}

async function getAccessToken(shop){
    const headers = {
        'Content-type': 'application/x-www-form-urlencoded'
    };
    const body = 'shop=' + encodeURIComponent(shop);
    return await dbConnect('get', headers, body);
}

async function insertAccessToken(shop, accessToken){
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    const body = JSON.stringify({ 'Shop': shop, 'AccessToken': accessToken, 'InstallDate': new Date().toISOString()})
    return await dbConnect('insert', headers, body);
}

async function dbConnect(type, headers, body){
    if(DEBUG_MODE === 'true'){
        console.log('dbConnect', body);
    }
    let method,
        name,
        endpoint,
        fetchOptions;
    switch (type) {
        case 'insert':
            method = 'POST';
            name = 'InsertToken';
            endpoint = DB_URL+'/api/v1/Shopify/InsertShopifyAccessToken';
            fetchOptions = {
                method: method,
                headers: headers,
                body: body
            };
            break;
        case 'get':
            method = 'GET';
            name = 'getAccessTokenStr';
            endpoint = DB_URL+'/api/v1/Shopify/GetShopifyAccessTokenStringByShop?'+body;
            fetchOptions = {
                method: method,
                headers: headers
            };
            break;
    }

    const dbConnectResponse = await fetch(endpoint, fetchOptions);

    if(name === 'InsertToken'){
        if(dbConnectResponse['Message']){
            throw new Error(dbConnectResponse['Message']);
        }
        return;
    }

    try {
        return await dbConnectResponse.json();
    } catch (e){
        throw new Error(e);
    }
}

async function sendOrderToUps(shop){
    const shippingDataResponse = await fetch(`${HOST}api/send-to-ups`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop})
    });
    try {
        const shippingDataJson = await shippingDataResponse.json();
        return shippingDataJson.metafields.filter((item) => item.namespace === 'pickups-integration');
    } catch (e) {
        console.log('sendOrderToUps Error:', e);
        return {'error': true, 'message': 'sendOrderToUps Error:'+e };
    }
}

async function saveOrderWeight(shop, orderId, orderWeight){
    const response = await fetch(`${HOST}api/save-order-weight`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'orderWeight': orderWeight})
    });

    return await response.json();
}

async function updatedMetafields(shop){
    await fetch(`${HOST}api/set-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop })
    });
}

async function getClosestPoints(shop, shippingData, customerShippingAddress, pointsNumber = null){
    const shippingDataFields = shippingData.metafields;
    const integrationData = shippingDataFields.filter((item) => item.namespace === 'pickups-integration');
    const apiHost = getFieldFromIntegrationData(integrationData,'upsApiUrl');
    const apiUrl = apiHost + 'api/v1/pickups/getclosestpoints';

    const {isLoggedIn, accessToken} = await getRestApiAccessToken(integrationData, 'print');
    if (!isLoggedIn) {
        return { 'errors': 'Auth Error' }
    }

    let pointTypes = shippingDataFields.find((item) => item.key === 'upsPickupsType').value;
    switch(pointTypes){
        case 'stores':
            pointTypes = 1;
            break;
        case 'lockers':
            pointTypes = 2;
            break;
        case 'all':
            pointTypes = 3;
            break;
    }
    const closestPointsAccuracy = shippingDataFields.find((item) => item.key === 'closestPointsAccuracy').value;
    const points = pointsNumber !== null ? pointsNumber : shippingDataFields.find((item) => item.key === 'closestPointsNumber').value;

    let functionArgs = {
        'city': customerShippingAddress.city,
        'street': customerShippingAddress.address1,
        'houseNumber': customerShippingAddress.address2 || 0,
        'pointTypes': pointTypes,
        'points': points
    }

    const params = new URLSearchParams(functionArgs).toString();

    try {
        const getClosestPointsResponse = await fetch(apiUrl+'?'+params, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            }
        });
        const data = await getClosestPointsResponse.json();
        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['IsSuccessful'] !== true){
            throw data['ErrorMSG'];
        }

        const accuracyCodes = getAccuracyCode(closestPointsAccuracy);
        if(!accuracyCodes.includes(data['ResponseCode'])){
            throw 'Pickup points not found';
        }

        return { 'response': data['Points'], 'accuracy': {'value': closestPointsAccuracy, 'label': getAccuracyLabel(closestPointsAccuracy)} };

    } catch (e) {
        console.log('getClosestPoints Error: ',e);
        return { 'errors': e }
    }
}

function getAccuracyCode(type){
    const accuracyCodes = [];

    // exact
    accuracyCodes.push('100');
    accuracyCodes.push('200');
    accuracyCodes.push('300');
    accuracyCodes.push('400');

    if(type !== 'exact') {
        accuracyCodes.push('120');
        accuracyCodes.push('125');
        accuracyCodes.push('220');
    }

    if(type === 'city') {
        accuracyCodes.push('840');
    }

    return accuracyCodes;
}

function getAccuracyLabel(type){
    switch(type){
        case 'exact':
            return 'מדוייק';
        case 'city':
            return 'עד מרכז העיר';
        case 'street':
            return 'עד מרכז רחוב';
    }
}

function getAccuracyCodeLabel(code){
    switch(code){
        case '100':
        case '200':
        case '300':
        case '400':
            return 'מדוייק';
        case '120':
        case '125':
        case '220':
            return 'עד מרכז רחוב';
        case '840':
            return 'עד מרכז העיר';
        default:
            return code;
    }
}

module.exports = {
    getShopifyRequestHeaders,
    getIntegrationData,
    getOrderData,
    saveOrderNote,
    saveOrderPickupPoint,
    orderIntegrationIsEnabled,
    orderAutomaticSendIsEnabled,
    getRestApiAccessToken,
    verifyHmac,
    verifyHmacWebhook,
    getAccessToken,
    insertAccessToken,
    isPickUpsShippingMethod,
    autoSendToUps,
    getFieldFromIntegrationData,
    restApiPrintLabel,
    mergePdf,
    saveOrderWeight,
    updatedMetafields,
    orderClosestPointsWhileSendToUpsIsEnabled,
    getShippingData,
    getClosestPoints
}
