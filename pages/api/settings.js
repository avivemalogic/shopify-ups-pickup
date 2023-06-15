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
    let orderId = req.query.id;
    const requestQuery = req.query;
    const urlParams = new URLSearchParams(requestQuery);
    let output = '';
    let isPickups = false;
    let orderSentToUps = false;

    if(output === '') {
        const getOrderJson = await getOrderData(shop, orderId);
        if (getOrderJson.errors) {
            output += `${getOrderJson.errors}`;
        }else {
            const orderName = getOrderJson.order.name.replace('#', '$');
            const shippingMethod = getOrderJson.order.shipping_lines[0].code;
            isPickups = isPickUpsShippingMethod(shippingMethod);

            const orderPickupsData = await getOrderPickupsData(shop, orderId);
            if (orderPickupsData.orderSentToUps) {
                orderSentToUps = true;
            }
        }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.redirect(`/settings?${urlParams}&output=${output}&is_pickups=${isPickups}&send_to_ups=${orderSentToUps}`);
}
