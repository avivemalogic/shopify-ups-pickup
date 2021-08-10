import {
    Button,
    Card,
    Layout,
    Page,
} from '@shopify/polaris';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';
import React, { Component } from 'react';

class Output extends Component {
    constructor() {
        super();
        this.state = {
            'apiKey': API_KEY,
            'shop': '',
            'orderId': '',
            'output': [],
            'file': null
        };
    }
    componentDidMount () {
        const getParameters = this.findGetParameter();

        if(getParameters.output){
            this.setState({
                'output': unescape(getParameters.output.replaceAll('$','#')),
                'shop': unescape(getParameters.shop),
                'orderId': unescape(getParameters.order_id)
            })

            if(getParameters.file){
                console.log(getParameters.file);
                this.setState({
                    'file': unescape(getParameters.file),
                    'output': 'Your label will be open automatically in a few seconds...'
                })

                setTimeout(function(){
                    const newTab = window.open(getParameters.file, '_blank');
                    if(newTab !== null)  newTab.focus();
                }, 3000)

                const timer = ms => new Promise(res => setTimeout(res, ms))

                const self = this;
                async function loadingTimeText () {
                    for (let i = 3; i >= 0; i--) {

                        let text = `Your label will be open automatically in `;
                        text += i > 1 ? `${i} seconds...` : `${i} second...`;

                        if(i === 0){
                            text = 'Your label is ready.';
                        }

                        self.setState({
                            'output': text
                        })
                        await timer(1000);
                    }
                }

                loadingTimeText();
            }
        }
    }

    render() {
        return (
            <Page>
                <Layout>
                    <Layout.AnnotatedSection title="Information">
                        <Card sectioned>
                            <div dangerouslySetInnerHTML={{ __html: this.state.output}}></div>
                            { this.state.file ? <p>you can <a href={this.state.file} target="_blank">Click Here to open Label</a></p> : ''}
                        </Card>
                    </Layout.AnnotatedSection>
                    <Layout.AnnotatedSection>
                        <Button
                            onClick={this.buttonClick}
                        >
                            { this.state.orderId ? 'Back to my order' : 'Back to my orders '}

                        </Button>
                    </Layout.AnnotatedSection>
                </Layout>
            </Page>
        );
    }

    buttonClick = () => {
        const app = createApp({
            apiKey: this.state.apiKey,
            shopOrigin: this.state.shop,
        });
        const orderIdPath = this.state.orderId ? '/'+this.state.orderId : '';
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.ADMIN_PATH, {
            path: '/orders'+orderIdPath
        });
    }

    findGetParameter = () => {
        const url = window.location.search.replace("?", "").toLowerCase().split('&'),
            params = {};

        for(let i=0, urlLength = url.length; i<urlLength; i++) {
            const prop = url[i].slice(0, url[i].search('='));
            params[prop] = url[i].slice(url[i].search('=')).replace('=', '');
        }
        return params;
    }
}

export default Output;
