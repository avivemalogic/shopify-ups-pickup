import React, { useEffect, useState } from "react";
import {Card, OptionList} from "@shopify/polaris";

const AllowedShippingMethod = ({ shop, onChange, shippingMethodSelected}) => {
    const [shippingMethods, setShippingMethods] = useState([]);
    shippingMethodSelected = shippingMethodSelected.split(',');
    const [selected, setSelected] = useState(shippingMethodSelected);

    const handleChange = (value) => {
        setSelected(value);
        onChange(value);
    }

    useEffect(() => {
        function getAvailableShippingMethods() {
            try {
                fetch(`api/get-shipping-methods`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({'shop': shop, 'isPrivate': true})
                })
                .then((response) => response.json())
                .then((data) => {
                    if(data.length > 0) {
                        setShippingMethods(data);
                        setSelected(selected.filter(item => data.some(obj => obj.value === item)));
                    }
                });
            } catch (e){

            }
        }
        getAvailableShippingMethods();
    }, []);

    return (
        <Card sectioned>
            Allowed Shipping Methods
            {shippingMethods &&
                <OptionList
                    onChange={handleChange}
                    selected={selected}
                    label="Allowed Shipping Methods"
                    options={shippingMethods}
                    allowMultiple
                />
            }
        </Card>
    );
};
export default AllowedShippingMethod;