const { HOST } = process.env;
const PLUGIN_FIELDS_VERSION = "1.0.3";
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
    InlineError
} from '@shopify/polaris';
import React, { Component } from 'react';

class Index extends Component {
    constructor(props) {
        super(props);
        this.state = {
            'savedText': '',
            'isLoading': false,
            'shop': '',
            'isChanged': [],
            'upsPickupsType': {},
            'upsPickupsMapType': {},
            'upsPickupsOpenMapOnLoad': {},
            'upsPickupsChangePickupPoint': {},
            'enableOrderIntegration': {},
            'upsApiUrl': {},
            'upsIntegrationUsername': {},
            'upsIntegrationPassword': {},
            'upsIntegrationScope': {},
            'upsIntegrationReference2': {},
            'orderIntegrationAutomatic': {}
        };
    }

    static async getInitialProps({query}) {
        const shop = query.shop;

        let data = '';

        if(shop) {
            // Get Shipping Data
            const response = await fetch(`${HOST}api/get-shipping-data`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({'shop': shop, 'isPrivate': true})
            });
            const json = await response.json();

            data = Object.assign(json, {'shop': shop});

            // New Fields Update
            const currentFieldsVersion = json.metafields.find((item) => item.key === 'fieldsVersion');
            if(currentFieldsVersion === undefined || currentFieldsVersion.value !== PLUGIN_FIELDS_VERSION){
                const currentFieldsVersionMetafieldID = currentFieldsVersion.id;

                const fieldsVersionFields = [{
                    "id": currentFieldsVersionMetafieldID,
                    "value": PLUGIN_FIELDS_VERSION,
                    "value_type": "string"
                }];
                await fetch(`${HOST}api/save-shipping-data`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({'shop': shop, 'fields': fieldsVersionFields })
                });

                await fetch(`${HOST}api/set-shipping-data`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({'shop': shop })
                });
            }
        }

        return {
            data
        }
    }
    async componentDidMount(){
        const shop = this.props.data.shop;

        if(shop){
            this.setState({
                'shop': shop
            })
        }

        if(this.props.data.metafields){
            this.props.data.metafields.forEach((item) => {
                this.setState({
                    [item.key]: {
                        'id': item.id,
                        'namespace': item.namespace,
                        'value': item.value,
                        'value_type': item.value_type
                    }
                })
            })
        }
    }

    render() {
        const state = this.state;
        const DISABLE_TEXT = 'Disable';
        const ENABLE_TEXT = 'Enable';
        const DISABLE_STATUS = 'disabled';
        const ENABLE_STATUS = 'enabled';
        const upsPickupTypeOptions = [
            {label: 'Stores & Lockers', value: 'all'},
            {label: 'Stores', value: 'stores'},
            {label: 'Lockers', value: 'lockers'},
        ];
        const upsPickupMapTypeOptions = [
            {label: 'Test', value: 'test'},
            {label: 'Live', value: 'live'}
        ];
        const upsIntegrationReference2Options = [
            {label: 'None', value: 'none'},
            {label: 'Order ID', value: 'order_id'},
            {label: 'Customer Name', value: 'customer_name'},
            {label: 'Customer E-Mail', value: 'email'},
            {label: 'Customer Phone Number', value: 'phone_number'},
            {label: 'Pickup Point ID', value: 'pickup_point_id'},
            {label: 'Pickup Point Name', value: 'pickup_point_name'}
        ];

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
                    <Layout.AnnotatedSection title="Pick Up Settings">
                        <Card sectioned>
                            <Select
                                value={state.upsPickupsType.value}
                                onChange={this.handleChange('upsPickupsType')}
                                label="Pickup Point Type"
                                options={upsPickupTypeOptions}
                            />
                        </Card>
                        <Card sectioned>
                            <Select
                                value={state.upsPickupsMapType.value}
                                onChange={this.handleChange('upsPickupsMapType')}
                                label="Pickup Point Map Env"
                                options={upsPickupMapTypeOptions}
                            />
                        </Card>
                        <SettingToggle
                            action={{
                                content: state.upsPickupsOpenMapOnLoad.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                onAction: this.toggleOpenMapOnLoad,
                            }}
                            enabled={state.upsPickupsOpenMapOnLoad.value} >
                            Open Map On Load is <TextStyle variation="strong">{state.upsPickupsOpenMapOnLoad.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                        </SettingToggle>
                        <SettingToggle
                            action={{
                                content: state.upsPickupsChangePickupPoint.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                onAction: this.toggleChangePickupPoint,
                            }}
                            enabled={state.upsPickupsChangePickupPoint.value} >
                            Change Pickup Point is <TextStyle variation="strong">{state.upsPickupsChangePickupPoint.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                        </SettingToggle>
                    </Layout.AnnotatedSection>
                    <Layout.AnnotatedSection title="Order Integration">
                        <SettingToggle
                            action={{
                                content: state.enableOrderIntegration.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                onAction: this.toggleOrderIntegration,
                            }}
                            enabled={state.enableOrderIntegration.value} >
                            Order Integration is <TextStyle variation="strong">{state.enableOrderIntegration.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                        </SettingToggle>

                        <div style={{display: state.enableOrderIntegration.value === 'true' ? 'block' : 'none' }}>

                            <div style={{margin: '2rem 0'}}>
                                <SettingToggle
                                    action={{
                                        content: state.orderIntegrationAutomatic.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                        onAction: this.toggleOrderIntegrationAutomatic,
                                    }}
                                    enabled={state.orderIntegrationAutomatic.value} >
                                    Order Automatic Send is <TextStyle variation="strong">{state.orderIntegrationAutomatic.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                                </SettingToggle>
                            </div>

                            <Card sectioned>
                                <TextField
                                    value={state.upsApiUrl.value}
                                    onChange={this.handleChange('upsApiUrl')}
                                    label="REST Api URL"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsIntegrationUsername.value}
                                    onChange={this.handleChange('upsIntegrationUsername')}
                                    label="REST Api Username"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsIntegrationPassword.value}
                                    onChange={this.handleChange('upsIntegrationPassword')}
                                    label="REST Api Password"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsIntegrationScope.value}
                                    onChange={this.handleChange('upsIntegrationScope')}
                                    label="REST Api Scope"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <Select
                                    value={state.upsIntegrationReference2.value}
                                    onChange={this.handleChange('upsIntegrationReference2')}
                                    label="Additional Field (Reference2)"
                                    options={upsIntegrationReference2Options}
                                />
                            </Card>
                        </div>
                    </Layout.AnnotatedSection>

                    { state.isLoading ? <div style={{height: '100px'}}><Frame><Loading/></Frame></div> : ''}

                    <Layout.AnnotatedSection>
                        <Form onSubmit={(e)=> this.handleSubmit(e)} disabled={state.isLoading}>
                            <FormLayout>
                                <Stack distribution="trailing">
                                    { state.savedText ? <span>{state.savedText}</span> : ''}
                                    <Button primary submit>
                                        Save
                                    </Button>
                                </Stack>
                            </FormLayout>
                        </Form>
                    </Layout.AnnotatedSection>
                </Layout>
            </Page>
        );
    }

    handleSubmit = async (e) => {
        e.preventDefault();
        this.setState({'isLoading': true})
        const object = {'shop': this.state.shop, 'fields': []};

        this.state.isChanged.map((val) => { object.fields.push(this.state[val]) });

        await fetch(`api/save-shipping-data`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(object)
        });

        this.setState({'isLoading': false})
        this.setState({'isChanged': []});
        this.setState({'savedText': '✔ Saved!'})

        setTimeout(() => this.setState({'savedText': ''}), 3000)
    };
    handleChange = (field) => {
        return (val) => {
            const newObject = this.state[field];
            newObject.value = val;
            this.setState({[field]: newObject});

            if(this.state.isChanged.length === 0 || !this.state.isChanged.includes(field)) {
                const isChanged = this.state.isChanged.concat(field);
                this.setState({'isChanged': isChanged});
            }
        }
    };
    toggleOrderIntegration = () => {
        this.handleToggle('enableOrderIntegration');
    };
    toggleOpenMapOnLoad = () => {
        this.handleToggle('upsPickupsOpenMapOnLoad');
    };
    toggleChangePickupPoint = () => {
        this.handleToggle('upsPickupsChangePickupPoint');
    };
    toggleOrderIntegrationAutomatic = () => {
        this.handleToggle('orderIntegrationAutomatic');
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
