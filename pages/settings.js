const { HOST } = process.env;
import {
    Button,
    Card,
    Form,
    FormLayout,
    Layout,
    Page,
    Select,
    SettingToggle,
    Stack,
    TextField,
    TextStyle,
    Frame,
    Loading,
    InlineError,
    Checkbox,
    Icon,
    Spinner
} from '@shopify/polaris';
import { CircleTickMajor } from "@shopify/polaris-icons";
import React, { Component } from 'react';

async function getOrderAdditionalInfo(shop, orderId){
    const getOrderMetafieldsResponse = await fetch(`${HOST}api/get-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });

    const metafields = {
        'metafields': []
    }
    const getOrderMetafieldsJson = await getOrderMetafieldsResponse.json();

    metafields.metafields.push({
        'key': 'pickups_is_ddo',
        'namespace': 'pickups_additional',
        'value': '',
        'type': 'string'
    });
    metafields.metafields.push({
        'key': 'pickups_cod_details',
        'namespace': 'pickups_additional',
        'value': '',
        'type': 'string'
    });
    metafields.metafields.push({
        'key': 'pickups_cod_value',
        'namespace': 'pickups_additional',
        'value': '',
        'type': 'string'
    });
    metafields.metafields.push({
        'key': 'pickups_is_udr',
        'namespace': 'pickups_additional',
        'value': '',
        'type': 'string'
    });
    metafields.metafields.push({
        'key': 'pickups_is_return',
        'namespace': 'pickups_additional',
        'value': '',
        'type': 'string'
    });
    metafields.metafields.push({
        'key': 'pickups_num_of_packages',
        'namespace': 'pickups_additional',
        'value': '1',
        'type': 'string'
    });

    for (const newObj of getOrderMetafieldsJson.metafields) {
        const matchingObj = metafields.metafields.find(obj => obj.key === newObj.key && obj.namespace === newObj.namespace);
        if (matchingObj) {
            matchingObj.value = newObj.value;
        }
    }

    return metafields;
}

class Index extends Component {
    constructor(props) {
        super(props);
        this.state = {
            'savedText': '',
            'isLoading': true,
            'orderId': '',
            'shop': '',
            'customerType': null,
            'isPickups': true,
            'orderSentToUps': false,
            'requiredFields': [],
            'isChanged': [],
            'pickups_is_ddo': {},
            'pickups_cod_details': {},
            'pickups_cod_value': {},
            'pickups_is_udr': {},
            'pickups_is_return': {},
            'pickups_num_of_packages': {}
        };
    }

    static async getInitialProps({query}) {
        const shop = query.shop;
        const orderId = query.id;
        const isPickups = query.is_pickups;
        const orderSentToUps = query.send_to_ups;

        let data = '';

        if(shop) {
            // Get order Data
            const json = await getOrderAdditionalInfo(shop, orderId);

            data = Object.assign(json, {'shop': shop, 'orderId': orderId, 'isPickups': isPickups, 'orderSentToUps': orderSentToUps});
        }

        return {
            data
        }
    }
    async componentDidMount(){
        const shop = this.props.data.shop;
        const orderId = this.props.data.orderId;
        const isPickups = this.props.data.isPickups;
        const orderSentToUps = this.props.data.orderSentToUps;

        console.log('orderSentToUps', orderSentToUps)
        console.log('orderSentToUps true?', orderSentToUps === 'true')

        if(shop){
            this.setState({
                'shop': shop,
                'orderId': orderId,
                'isPickups': isPickups === 'true',
                'orderSentToUps': orderSentToUps === 'true'
            })
        }

        if(this.props.data.metafields){
            this.props.data.metafields.forEach((item) => {
                this.setState({
                    [item.key]: {
                        'key': item.key,
                        'namespace': item.namespace,
                        'value': item.value,
                        'type': item.type
                    }
                })
            })
        }

        this.checkAuthInformation(shop).then(() => {
            this.setState({'isLoading': false})
        });
    }

    render() {
        const state = this.state;
        const DISABLE_TEXT = 'בטל';
        const ENABLE_TEXT = 'הפעל';
        const DISABLE_STATUS = 'לא';
        const ENABLE_STATUS = 'כן';

        if(state.shop === ''){
            return (
                <Page>
                    <Layout>
                        You are not allowed
                    </Layout>
                </Page>
            );
        }

        return (
            <Page>
                <Layout>
                    {state.isPickups === false &&
                    <Layout.AnnotatedSection title="UPS Additional Options">
                        <div style={{margin: '2rem 0', direction: 'rtl', textAlign: 'right'}}>
                            <Card sectioned>
                                {state.orderSentToUps !== true ?
                                    <TextField
                                        value={state.pickups_cod_value.value === '' ? '' : state.pickups_cod_value.value}
                                        onChange={this.handleChange('pickups_cod_value', 'number', 50000)}
                                        label="סכום COD"
                                        type="number"
                                        step="0.1"
                                    />
                                    : "סכום COD: "+state.pickups_cod_value.value }

                                {state.orderSentToUps !== true &&
                                <div style={{marginTop: '10px', direction: 'rtl'}}>
                                    <div>גביית תשלום במעמד הפצה</div>
                                    <InlineError message='איסוף התשלום במזומן מוגבל עד 5,000 ש"ח ובצק עד 50,000 ש"ח.'
                                                 fieldID="pickups_cod_value"/>
                                </div>
                                }
                            </Card>
                            <Card sectioned>
                                {state.orderSentToUps !== true ?
                                    <TextField
                                        value={state.pickups_cod_details.value === 'X' ? '' : state.pickups_cod_details.value}
                                        onChange={this.handleChange('pickups_cod_details', 'text')}
                                        label="הערות COD"
                                        type="text"
                                        maxLength={50}
                                    />
                                    : "הערות COD: "+state.pickups_cod_details.value }
                            </Card>
                        </div>

                        <div style={{margin: '2rem 0', direction: 'rtl', textAlign: 'right'}}>
                            <Card sectioned>
                                <Checkbox
                                    label={"UDR: "+(state.pickups_is_udr.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS)}
                                    checked={state.pickups_is_udr.value === 'true'}
                                    onChange={this.toggleIsUDR}
                                    disabled={state.orderSentToUps === true}
                                />
                                <div>החתמה והחזרת ניירת</div>
                            </Card>
                        </div>

                        {state.pickups_is_udr.value === 'true' &&
                        <div style={{margin: '2rem 0', direction: 'rtl', textAlign: 'right'}}>
                            <Card sectioned>
                                <Checkbox
                                    label={"איסוף כנגד הפצה: "+(state.pickups_is_return.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS)}
                                    checked={state.pickups_is_return.value === 'true'}
                                    onChange={this.toggleIsReturn}
                                    disabled={state.orderSentToUps === true}
                                />
                            </Card>
                        </div>
                        }

                        <div style={{margin: '2rem 0 0', direction: 'rtl', textAlign: 'right'}}>
                            <Card sectioned>
                                <Checkbox
                                    label={"DDO: "+(state.pickups_is_ddo.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS)}
                                    checked={state.pickups_is_ddo.value === 'true'}
                                    onChange={this.toggleIsDDO}
                                    disabled={state.orderSentToUps === true}
                                />
                                <div>שירות מסירה בכתובת מוגדרת</div>
                            </Card>
                        </div>

                    </Layout.AnnotatedSection>
                    }
                    <Layout.AnnotatedSection title="Multiple Packages">
                        <Card sectioned>
                            <div style={{textAlign: 'right', direction: 'rtl'}}>
                                {state.orderSentToUps !== true && state.customerType === 'אשראי' ?
                                    <TextField
                                        value={state.pickups_num_of_packages.value}
                                        onChange={this.handleChange('pickups_num_of_packages','number', 99)}
                                        label="כמות חבילות"
                                        type="number"
                                    />
                                    : "כמות חבילות: "+(state.pickups_num_of_packages.value || 1) }
                            </div>
                        </Card>
                    </Layout.AnnotatedSection>

                    { state.isLoading ? <div style={{height: '100px'}}><Frame><Loading/></Frame></div> : ''}

                    {state.orderSentToUps === true ?
                        <div style={{marginTop: '10px', direction: 'rtl', textAlign: 'right', flexBasis: '100%'}}>
                            <InlineError message="ההזמנה נשלחה ולכן לא ניתן לבצע שינויים"/>
                        </div>
                        :
                        <Layout.AnnotatedSection>
                            <Form onSubmit={(e) => this.handleSubmit(e)} disabled={state.isLoading}>
                                <FormLayout>
                                    <Stack distribution="trailing">
                                        {state.savedText ? <span>{state.savedText}</span> : ''}
                                        <Button primary submit>
                                            Save
                                        </Button>
                                    </Stack>
                                </FormLayout>
                            </Form>
                        </Layout.AnnotatedSection>
                    }
                </Layout>
            </Page>
        );
    }

    handleSubmit = async (e) => {
        e.preventDefault();
        this.setState({'isLoading': true})
        const object = {'shop': this.state.shop, 'fields': []};
        let error;

        this.state.requiredFields.map((val) => {
            if(this.state[val.value].value === 'X'){
                if(val.deps.length === 0 || val.deps.length > 0 && this.state[val.deps].value === 'true') {
                    error = val.value;
                }
            }
        })

        if(error){
            window.scroll({top: 0, left: 0, behavior: 'smooth'});
            this.setState({'isLoading': false})
            return error;
        }

        this.state.isChanged.map((val) => { object.fields.push(this.state[val]) });

        await fetch(`api/save-order-additional-info`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.assign(object, {'orderId': this.state.orderId}))
        });

        this.setState({'isLoading': false})
        this.setState({'isChanged': []});
        this.setState({'savedText': '✔ Saved!'})

        setTimeout(() => this.setState({'savedText': ''}), 3000)
    };

    checkAuthInformation = async (shop) => {
        try {
            const response = await fetch(`api/get-shipping-data`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({'shop': shop, 'isPrivate': true, 'checkAuthInformation': true})
            });

            const json = await response.json();

            this.setState({'customerType': json.customerType })
        } catch (e){

        }
    };

    handleChange = (field, type, max = null) => {
        return (val) => {
            if(type === 'number'){
                if(val < 0 || (max !== null && val > max)) {
                    return;
                }
            }
            const newObject = this.state[field];
            newObject.value = val ? val : 'X';
            this.setState({[field]: newObject});

            if(this.state.isChanged.length === 0 || !this.state.isChanged.includes(field)) {
                const isChanged = this.state.isChanged.concat(field);
                this.setState({'isChanged': isChanged});
            }
        }

    };
    toggleIsDDO = () => {
        this.handleToggle('pickups_is_ddo');
    };
    toggleIsUDR = () => {
        this.handleToggle('pickups_is_udr');
    };
    toggleIsReturn = () => {
        this.handleToggle('pickups_is_return');
    };
    handleToggle = (fieldName) => {
        const newObject = this.state[fieldName];
        newObject.value = newObject.value === 'true' ? 'false' : 'true';
        this.setState({[fieldName]: newObject});

        if(this.state.isChanged.length === 0 || !this.state.isChanged.includes(fieldName)) {
            const isChanged = this.state.isChanged.concat(fieldName);
            this.setState({'isChanged': isChanged});
        }
    };
}

export default Index;
