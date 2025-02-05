const { HOST } = process.env;
const { getOrderData, getAccessToken, isPickUpsShippingMethod, getOrderPickupsData, saveOrderPickupPoint } = require('../../server/helper');


export default async (req, res) => {
    const shop = req.query.shop;
    const hmac = req.query.hmac;
    const hmacVerified = req.query.automatic;
    let orderIds = req.query.id;
    const requestQuery = req.query;
    const pickupPoint = req.query.pickupPoint;
    const urlParams = new URLSearchParams(requestQuery);
    let output = '';

    const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop})
    });
    const shippingMetafields = await shippingDataResponse.json();
    const upsPickupsChangePickupPoint = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsChangePickupPoint');
    if(upsPickupsChangePickupPoint === undefined || upsPickupsChangePickupPoint.value !== 'true'){
        output += `Change pickup point option is disabled, to enable it, go to the app settings and change it`;
    }

    const upsPickupsTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsType');
    const upsPickupsType = upsPickupsTypeField.value;
    const upsPickupsMapTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsMapType');
    const upsPickupsMapType = upsPickupsMapTypeField.value === 'test' ? 'beta.' : '';

    if(output === '') {

        const accessToken = await getAccessToken(shop);

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

            const orderName = getOrderJson.order.name.replace('#', '$');
            const shippingMethod = getOrderJson.order.shipping_lines[0].code;
            const isPickups = isPickUpsShippingMethod(shippingMethod);

            if(!isPickups){
                output += `You cant choose pickup point for shipping method: ${shippingMethod} in order ${orderName}`;
                continue;
            }

            const orderPickupsData = await getOrderPickupsData(shop, accessToken, orderId);
            if (orderPickupsData.orderSentToUps) {
                output += `Order ${orderName} already sent to Ups, you cant change a pickup point for order that already sent`;
                continue;
            }

            if(pickupPoint){
                await saveOrderPickupPoint(shop, accessToken, orderId, pickupPoint, getOrderJson, true)

                res.end('success');
                return;
            }
            output = '';
        }

    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    const safeUrl = encodeURI(`/change-pickup-point?${urlParams}&output=${output}&ups_pickups_type=${upsPickupsType}&ups_pickups_map_type=${upsPickupsMapType}`);
    res.redirect(safeUrl);
}
