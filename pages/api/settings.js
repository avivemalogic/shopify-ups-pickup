const { getOrderData, getAccessToken, isPickUpsShippingMethod, getOrderPickupsData } = require('../../server/helper');

export default async (req, res) => {
    const shop = req.query.shop;
    let orderId = req.query.id;
    const requestQuery = req.query;
    const urlParams = new URLSearchParams(requestQuery);
    let output = '';
    let isPickups = false;
    let orderSentToUps = false;

    if(output === '') {

        const accessToken = await getAccessToken(shop);

        const getOrderJson = await getOrderData(shop, accessToken, orderId);
        if (getOrderJson.errors) {
            output += `${getOrderJson.errors}`;
        }else {
            const shippingMethod = getOrderJson.order.shipping_lines[0].code;
            isPickups = isPickUpsShippingMethod(shippingMethod);

            const orderPickupsData = await getOrderPickupsData(shop, accessToken, orderId);
            if (orderPickupsData.orderSentToUps) {
                orderSentToUps = true;
            }
        }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.redirect(`/settings?${urlParams}&output=${output}&is_pickups=${isPickups}&send_to_ups=${orderSentToUps}`);
}
