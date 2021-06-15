(async function () {
    const HOST = 'https://shopify.emalogic.com/';
    const shop = Shopify.shop;

    let upsPickupsType = 'all';
    let upsPickupsMapType = 'test';
    try {
        const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({'shop': shop})
        });
        const shippingMetafields = await shippingDataResponse.json();
        const upsPickupsTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsType');
        upsPickupsType = upsPickupsTypeField.value;
        const upsPickupsMapTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsMapType');
        upsPickupsMapType = upsPickupsMapTypeField.value;
    } catch (error) {
       console.log(error);
    }

    const upsPickupsMapTest = upsPickupsMapType === 'test' ? 'beta.' : '';

    const pkp = document.createElement('script');
    pkp.type = 'text/javascript';
    pkp.async = true;
    pkp.src = `https://${upsPickupsMapTest}pickuppoint.co.il/api/ups-pickups.sdk.${upsPickupsType}.js?r=2.0`;
    const scriptTag = document.getElementsByTagName('script')[0];
    scriptTag.parentNode.insertBefore(pkp, scriptTag);

    document.querySelector('.ups-pickups-button').classList.remove('hide');

    const pickupPointInputValue = document.getElementById('CartSpecialInstructions').value;
    if(pickupPointInputValue !== ''){
        pickup_render_description(JSON.parse(pickupPointInputValue));
    }

    document.body.addEventListener('pickups-after-choosen', async function (e, data) {
        const pkps_location = e.detail;
        const pickupPoint = JSON.stringify(pkps_location);

        pickup_render_description(pkps_location);

        document.getElementById('CartSpecialInstructions').value = pickupPoint;
    });

    function pickup_render_description(pkps_location){
        const html = "<br /><b>" + pkps_location.title + "</b>&nbsp;(" + pkps_location.iid + ")<br />" + pkps_location.city + ", " + pkps_location.street + "<br /><small>" + pkps_location.zip + "</small>";
        document.querySelector('div.ups-pickups-data').innerHTML = html;
    }
})();
