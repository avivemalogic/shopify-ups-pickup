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
            'requiredFields': [{ 'value': 'closestPointsPrice', 'deps': 'closestPointsEnabled' }],
            'isChanged': [],
            'upsPickupsType': {},
            'latestInstallation': {},
            'upsPickupsMapType': {},
            'upsPickupsOpenMapOnLoad': {},
            'upsPickupsChangePickupPoint': {},
            'enableOrderIntegration': {},
            'fulfillOrderItems': {},
            'fulfillOrderItemsNotify': {},
            'upsApiUrl': {},
            'upsApiCreateUrl': {},
            'upsIntegrationUsername': {},
            'upsIntegrationPassword': {},
            'upsIntegrationScope': {},
            'upsIntegrationReference2': {},
            'upsIntegrationOrderWeight': {},
            'upsIntegrationOrderWeightValue': {},
            'orderIntegrationAutomatic': {},
            'orderIntegrationClosestPoints': {},
            'closestPointsEnabled': {},
            'closestPointsPrice': {},
            'closestPointsMaxPrice': {},
            'closestPointsMaxAmount': {},
            'closestPointsMaxWeight': {},
            'closestPointsNumber': {},
            'closestPointsAccuracy': {},
            'closestPointsTitle': {}
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
        const upsIntegrationOrderWeightOptions = [
            {label: 'Items Weight', value: 'items'},
            {label: 'Fixed Value', value: 'fixed_value'}
        ];
        const closestPointsAccuracyOptions = [
            {label: 'עד מרכז העיר', value: 'city'},
            {label: 'עד מרכז רחוב', value: 'street'},
            {label: 'מדוייק', value: 'exact'}
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
                                onChange={this.handleChange('upsPickupsType','select')}
                                label="Pickup Point Type"
                                options={upsPickupTypeOptions}
                            />
                        </Card>
                        <Card sectioned>
                            <Select
                                value={state.upsPickupsMapType.value}
                                onChange={this.handleChange('upsPickupsMapType','select')}
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
                    <Layout.AnnotatedSection title="Closest Points">
                        <SettingToggle
                            action={{
                                content: state.closestPointsEnabled.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                onAction: this.toggleClosestPointsEnabled,
                            }}
                            enabled={state.closestPointsEnabled.value} >
                            Closest Points is <TextStyle variation="strong">{state.closestPointsEnabled.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                        </SettingToggle>
                        {state.closestPointsEnabled.value === 'true' &&
                            <div style={{margin: '2rem 0 0'}}>
                                <Card sectioned>
                                    <TextField
                                        value={state.closestPointsPrice.value}
                                        onChange={this.handleChange('closestPointsPrice', 'number')}
                                        label="Price"
                                        type="number"
                                        error={state.closestPointsPrice.value === 'X'}
                                    />
                                </Card>
                                <Card sectioned>
                                    <TextField
                                        value={state.closestPointsMaxAmount.value}
                                        onChange={this.handleChange('closestPointsMaxAmount', 'number')}
                                        label="Max Amount"
                                        type="number"
                                    />
                                    <div style={{marginTop: '10px', direction: 'rtl'}}>
                                        <InlineError message="חשוב לדעת-פונקציה זו אינה מתחשבת בקופונים/הנחות בסל הקניות , אלא בסכום המוצרים בסל הקניות לא כולל סעיף Discount על כן שימוש בפונקציה זו יחד עם קופון/הנחה יאפשר מצב של כפל מבצעים" fieldID="maxAmountField" />
                                    </div>
                                </Card>
                                <Card sectioned>
                                    <TextField
                                        value={state.closestPointsMaxPrice.value}
                                        onChange={this.handleChange('closestPointsMaxPrice', 'number')}
                                        label="Price After Max Amount"
                                        type="number"
                                    />
                                </Card>
                                <Card sectioned>
                                    <TextField
                                        value={state.closestPointsMaxWeight.value}
                                        onChange={this.handleChange('closestPointsMaxWeight','number')}
                                        label="Max Weight (Kg)"
                                        step="0.01"
                                        type="number"
                                    />
                                </Card>
                                <Card sectioned>
                                    <TextField
                                        value={state.closestPointsNumber.value === 'X' ? '' : state.closestPointsNumber.value}
                                        onChange={this.handleChange('closestPointsNumber', 'number')}
                                        label="Number of Closest Points"
                                        type="number"
                                    />
                                </Card>
                                <Card sectioned>
                                    <TextField
                                        value={state.closestPointsTitle.value === 'X' ? '' : state.closestPointsTitle.value}
                                        onChange={this.handleChange('closestPointsTitle','text')}
                                        label="Prefix Title"
                                        type="text"
                                    />
                                </Card>
                                <Card sectioned>
                                    <Select
                                        value={state.closestPointsAccuracy.value}
                                        onChange={this.handleChange('closestPointsAccuracy','select')}
                                        label="Closest Points Accuracy"
                                        options={closestPointsAccuracyOptions}
                                    />
                                </Card>
                            </div>
                        }
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

                            <div style={{margin: '2rem 0'}}>
                                <SettingToggle
                                    action={{
                                        content: state.orderIntegrationClosestPoints.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                        onAction: this.toggleOrderIntegrationClosestPoints,
                                    }}
                                    enabled={state.orderIntegrationClosestPoints.value} >
                                    Get Closest Point on Sent to Ups is <TextStyle variation="strong">{state.orderIntegrationClosestPoints.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                                </SettingToggle>
                            </div>

                            <Card sectioned>
                                <TextField
                                    value={state.upsApiCreateUrl.value === 'X' ? '' : state.upsApiCreateUrl.value}
                                    onChange={this.handleChange('upsApiCreateUrl','text')}
                                    label="REST Create Api URL"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsApiUrl.value === 'X' ? '' : state.upsApiUrl.value}
                                    onChange={this.handleChange('upsApiUrl','text')}
                                    label="REST Api URL"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsIntegrationUsername.value === 'X' ? '' : state.upsIntegrationUsername.value}
                                    onChange={this.handleChange('upsIntegrationUsername','text')}
                                    label="REST Api Username"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsIntegrationPassword.value === 'X' ? '' : state.upsIntegrationPassword.value}
                                    onChange={this.handleChange('upsIntegrationPassword','text')}
                                    label="REST Api Password"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.upsIntegrationScope.value === 'X' ? '' : state.upsIntegrationScope.value}
                                    onChange={this.handleChange('upsIntegrationScope','text')}
                                    label="REST Api Scope"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <Select
                                    value={state.upsIntegrationReference2.value}
                                    onChange={this.handleChange('upsIntegrationReference2','select')}
                                    label="Additional Field (Reference2)"
                                    options={upsIntegrationReference2Options}
                                />
                            </Card>
                            <Card sectioned>
                                <Select
                                    value={state.upsIntegrationOrderWeight.value}
                                    onChange={this.handleChange('upsIntegrationOrderWeight','select')}
                                    label="Order Weight By"
                                    options={upsIntegrationOrderWeightOptions}
                                />
                            </Card>

                            { state.upsIntegrationOrderWeight.value === 'fixed_value' &&
                                <Card sectioned>
                                    <TextField
                                        value={state.upsIntegrationOrderWeightValue.value}
                                        onChange={this.handleChange('upsIntegrationOrderWeightValue','number')}
                                        label="Weight Value (Kg)"
                                        step="0.01"
                                        type="number"
                                    />
                                </Card>
                            }
                        </div>
                    </Layout.AnnotatedSection>

                    { state.enableOrderIntegration.value === 'true'
                        ?
                        <Layout.AnnotatedSection title="Fulfill Order Items">
                            <SettingToggle
                                action={{
                                    content: state.fulfillOrderItems.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                    onAction: this.toggleFulfillOrderItems,
                                }}
                                enabled={state.fulfillOrderItems.value} >
                                Automatic fulfill order items is <TextStyle variation="strong">{state.fulfillOrderItems.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                            </SettingToggle>

                            <div style={{display: state.fulfillOrderItems.value === 'true' ? 'block' : 'none' }}>

                                <div style={{margin: '2rem 0'}}>
                                    <SettingToggle
                                        action={{
                                            content: state.fulfillOrderItemsNotify.value === 'true' ? DISABLE_TEXT : ENABLE_TEXT,
                                            onAction: this.toggleFulfillOrderItemsNotify,
                                        }}
                                        enabled={state.fulfillOrderItemsNotify.value} >
                                        Notify customer is <TextStyle variation="strong">{state.fulfillOrderItemsNotify.value === 'true' ? ENABLE_STATUS : DISABLE_STATUS}</TextStyle>.
                                    </SettingToggle>
                                </div>
                            </div>
                        </Layout.AnnotatedSection>
                        : ''
                    }

                    { state.isLoading ? <div style={{height: '100px'}}><Frame><Loading/></Frame></div> : ''}

                    <Layout.AnnotatedSection>
                        <Form onSubmit={(e)=> this.handleSubmit(e)} disabled={state.isLoading}>
                            <FormLayout>
                                {state.latestInstallation.value &&
                                    <div style={{float: 'left'}}>Last Installed: {state.latestInstallation.value}</div>
                                }
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
    handleChange = (field, type) => {
        return (val) => {
            if(type === 'number'){
                if(val < 0) {
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
    toggleOrderIntegration = () => {
        this.handleToggle('enableOrderIntegration');
    };
    toggleOpenMapOnLoad = () => {
        this.handleToggle('upsPickupsOpenMapOnLoad');
    };
    toggleClosestPointsEnabled = () => {
        this.handleToggle('closestPointsEnabled');
    };
    toggleChangePickupPoint = () => {
        this.handleToggle('upsPickupsChangePickupPoint');
    };
    toggleOrderIntegrationAutomatic = () => {
        this.handleToggle('orderIntegrationAutomatic');
    };
    toggleOrderIntegrationClosestPoints = () => {
        this.handleToggle('orderIntegrationClosestPoints');
    };
    toggleFulfillOrderItems = () => {
        this.handleToggle('fulfillOrderItems');
    };
    toggleFulfillOrderItemsNotify = () => {
        this.handleToggle('fulfillOrderItemsNotify');
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
