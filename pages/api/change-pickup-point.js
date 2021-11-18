const { HOST } = process.env;
const { getOrderData, verifyHmac, isPickUpsShippingMethod } = require('../../server/helper');

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


export default async (req, res) => {
    const shop = req.query.shop;
    const hmac = req.query.hmac;
    const hmacVerified = req.query.automatic;
    let orderIds = req.query.id;
    const requestQuery = req.query;
    const pickupPoint = req.query.pickupPoint;
    const urlParams = new URLSearchParams(requestQuery);
    let output = '';

    if(!hmacVerified && verifyHmac(requestQuery, hmac, false) === false){
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
            const shippingMethod = getOrderJson.order.shipping_lines[0].code;
            const isPickups = isPickUpsShippingMethod(shippingMethod);

            if(!isPickups){
                output += `You cant choose pickup point for shipping method: ${shippingMethod} in order ${orderName}`;
                continue;
            }

            const orderPickupsData = await getOrderPickupsData(shop, orderId);
            if (orderPickupsData.orderSentToUps) {
                output += `Order ${orderName} already sent to Ups, you cant change a pickup point for order that already sent`;
                continue;
            }

            const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({'shop': shop})
            });
            const shippingMetafields = await shippingDataResponse.json();
            const upsPickupsTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsChangePickupPoint');
            if(upsPickupsTypeField === undefined || upsPickupsTypeField.value !== 'true'){
                output += `Change pickup point option is disabled, to enable it, go to the app settings and change it`;
                continue;
            }

            if(pickupPoint){
                const getOrderResponse = await fetch(`${HOST}api/save-order-pickup-point`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({'shop': shop, 'orderId': orderId, 'pickupPoint': pickupPoint, 'autoSend': true})
                });

                if (getOrderResponse.status !== 200) {
                    return {'errors': `${getOrderResponse.status} - ${getOrderResponse.statusText}`}
                }
                await getOrderResponse.json();

                res.end('success');
                return;
            }
            output = '';
        }

    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.redirect(`/change-pickup-point?${urlParams}&output=${output}`);
}
