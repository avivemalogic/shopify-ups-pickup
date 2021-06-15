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
            'isChanged': [],
            'upsPickupsType': {},
            'upsPickupsMapType': {},
            'enableOrderIntegration': {},
            'webServiceShipUrl': {},
            'webServiceAuthUrl': {},
            'webServiceUsername': {},
            'webServicePassword': {},
            'orderIntegrationAutomatic': {}
        };
    }

    static async getInitialProps({query}) {
        const shop = query.shop;

        let data = '';

        if(shop) {
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
    componentDidMount(){
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

        if(this.props.data.shop){
            this.setState({
                'shop': this.props.data.shop
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
                                    value={state.webServiceShipUrl.value}
                                    onChange={this.handleChange('webServiceShipUrl')}
                                    label="Web Service Ship URL"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.webServiceAuthUrl.value}
                                    onChange={this.handleChange('webServiceAuthUrl')}
                                    label="Web Service Auth URL"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.webServiceUsername.value}
                                    onChange={this.handleChange('webServiceUsername')}
                                    label="Web Service Username"
                                    type="text"
                                />
                            </Card>
                            <Card sectioned>
                                <TextField
                                    value={state.webServicePassword.value}
                                    onChange={this.handleChange('webServicePassword')}
                                    label="Web Service Password"
                                    type="text"
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
