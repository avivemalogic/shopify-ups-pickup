const { HOST } = process.env;
const { getClosestPoints, getProductData, getDate } = require('../../server/helper');

function getAvailableRates(data, serviceNamePrefix, price){
    const arr = [];

    for(let i = 0, iLength = data.length; i < iLength; ++i){
        let serviceName = serviceNamePrefix ? serviceNamePrefix+' - ' : '';
        const serviceDescription = data[i].StreetName+ ' '+data[i].HouseNumber+', '+data[i].CityName;
        let distance;
        try {
            distance = Number(data[i].Distance).toFixed(2);
        } catch(e){
            distance = data[i].Distance;
        }
        arr.push({
            "service_name": serviceName+data[i].PointName +' '+ serviceDescription+' ('+distance+' ק"מ)',
            "service_code": 'pickups_'+data[i].PointID,
            "description": "",
            "total_price": price,
            "currency": "ILS"
        });
    }

    return arr;
}

export default async (req, res) => {
    const shop = req.headers['x-shopify-shop-domain'];
    console.log(getDate()+' shipping-rates shop: '+shop+' | init');
    const customerShippingAddress = req.body.rate.destination;

    res.statusCode = 200;

    if(!shop) {
        return res.end('Shop not Found');
    }

    console.log(getDate()+' shipping-rates shop: '+shop+' | before get-shipping-data');
    const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'isPrivate': true})
    });
    console.log(getDate()+' shipping-rates shop: '+shop+' | after get-shipping-data');
    const shippingDataJson = await shippingDataResponse.json();
    console.log(getDate()+' shipping-rates shop: '+shop+' | after get-shipping-data json');
    const shippingDataFields = shippingDataJson.metafields;

    const isEnabled = shippingDataFields.find((item) => item.key === 'closestPointsEnabled').value;
    const serviceName = shippingDataFields.find((item) => item.key === 'closestPointsTitle').value;
    const methodPrice = shippingDataFields.find((item) => item.key === 'closestPointsPrice').value;
    const methodPriceAfterMaxAmount = shippingDataFields.find((item) => item.key === 'closestPointsMaxPrice').value;
    const methodMaxAmount = shippingDataFields.find((item) => item.key === 'closestPointsMaxAmount').value;
    const methodMaxWeight = shippingDataFields.find((item) => item.key === 'closestPointsMaxWeight').value;
    const productFreeShippingEnabled = shippingDataFields.find((item) => item.key === 'productFreeShippingEnabled');
    const isProductFreeShippingEnabled = productFreeShippingEnabled !== undefined ? productFreeShippingEnabled.value : '';
    const cartItems = req.body.rate.items;
    const itemsTotalPrice = cartItems.reduce( ( sum, { price, quantity } ) => sum + (price * quantity) , 0);
    const itemsTotalWeightGrams = cartItems.reduce( ( sum, { grams, quantity } ) => sum + (grams * quantity) , 0);

    if(isEnabled !== 'true' || !methodPrice || methodPrice === 'X') {
        return res.end('Closest Points is Disabled');
    }

    let price = methodPrice * 100;
    if(itemsTotalPrice >= (methodMaxAmount * 100)){
        price = methodPriceAfterMaxAmount * 100;
    }

    if(methodMaxWeight !== 'X' && methodMaxWeight > 0 && itemsTotalWeightGrams > 0){
        if(itemsTotalWeightGrams > (Number(methodMaxWeight) * 1000)) {
            const errorMessage = 'Order Items are overweight';
            console.log(errorMessage);
            return res.end(errorMessage);
        }
    }

    let freeShipping = false;
    if(isProductFreeShippingEnabled === 'true'){
        for(let i = 0, iLength = cartItems.length; i < iLength; ++i){
            const productId = cartItems[i].product_id;

            const productData = await getProductData(shop, productId);
            try {
                const productTagIsFreeShipping = productData.product.tags.includes('pickups_free');
                if(productTagIsFreeShipping){
                    freeShipping = true
                }else{
                    freeShipping = false;
                    break;
                }
            } catch (e) {
                freeShipping = false;
                break;
            }
        }
    }

    if(freeShipping){
        price = 0;
    }

    try {
        console.log(getDate()+' shipping-rates shop: '+shop+' | before get-closest-points');
        const data = await getClosestPoints(shop, shippingDataJson, customerShippingAddress);
        console.log(getDate()+' shipping-rates shop: '+shop+' | after get-closest-points');

        if(data['errors']){
            console.log(getDate()+' shipping-rates shop: '+shop+' | errors: ', data);
            return res.end(data['errors']);
        }

        console.log(getDate()+' shipping-rates shop: '+shop+' | before getAvailableRates');

        const output = {
            "rates": getAvailableRates(data['response'], serviceName, price)
        };

        console.log(getDate()+' shipping-rates shop: '+shop+' | after getAvailableRates');

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(output))
    } catch (e){
        return res.end(JSON.stringify(e));
    }
}