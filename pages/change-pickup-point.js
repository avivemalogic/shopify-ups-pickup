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
            'isLoading': false,
            'apiKey': API_KEY,
            'noteText': 'שימו לב, בעת עדכון נקודה איסוף, שדה הערות ההזמנה יתאפס, במידה ושמרתם שם מידע, אנא שמרו אותו לפני ביצוע הפעולה',
            'shop': '',
            'output': [],
            'requestQuery': {},
            'pickupPoint': ''
        };
        this.pickupRenderDescription = this.pickupRenderDescription.bind(this);
    }
    async componentDidMount () {
        const getParameters = this.findGetParameter();

        if(typeof getParameters === 'object' && getParameters !== null) {
            const output = getParameters.output.replaceAll('$', '#');
            delete getParameters.output;

            await this.setState({
                'output': unescape(output),
                'shop': unescape(getParameters.shop),
                'requestQuery': getParameters
            })

            if(output === ''){
                const upsPickupsType = getParameters.ups_pickups_type || '';
                const upsPickupsMapType = getParameters.ups_pickups_map_type || '';
                const pkp = document.createElement('script');
                pkp.type = 'text/javascript';
                pkp.async = true;
                pkp.src = `https://${upsPickupsMapType}pickuppoint.co.il/api/ups-pickups.sdk.${upsPickupsType}.js?r=2.0`;
                const scriptTag = document.getElementsByTagName('script')[0];
                scriptTag.parentNode.insertBefore(pkp, scriptTag);

                this.initObservers();
            }
        }
    }

    render() {
        return (
            <Page>
                <Layout>
                    <Layout.AnnotatedSection title="Change Pickup Point">
                        <Card sectioned>
                            { this.state.output ?
                            <div dangerouslySetInnerHTML={{ __html: this.state.output}}></div>
                                :
                            <div className="pick-ups-wrapper pick-ups-step__description">
                                <div className="error-text">{this.state.noteText}</div>
                                <div className={`ups-pickups-button ${this.state.isLoading === true ? 'opacity-5' : ''}`} onClick={this.openPickUpsMap}>
                                    <div className={`loader ${this.state.isLoading === true ? '' : 'hidden'}`}></div>
                                </div>
                                { this.state.pickupPoint ? <div><div className="ups-pickups-data" dangerouslySetInnerHTML={{ __html: this.state.pickupPoint}}></div><strong className="success">הנקודה שבחרת נשמרה!</strong></div> : '' }
                            </div>
                            }
                        </Card>
                    </Layout.AnnotatedSection>
                    <Layout.AnnotatedSection>
                        <Button
                            onClick={this.backToOrderClick}
                        >
                            Back to Order
                        </Button>
                    </Layout.AnnotatedSection>
                </Layout>
            </Page>
        );
    }

    openPickUpsMap = () => {
        window.PickupsSDK.onClick();
    }

    backToOrderClick = () => {
        try {
            history.back();
        }catch (e) {
            const app = createApp({
                apiKey: this.state.apiKey,
                shopOrigin: this.state.shop,
            });

            const redirect = Redirect.create(app);
            redirect.dispatch(Redirect.Action.ADMIN_PATH, {
                path: `/admin/orders/${this.state.orderId}`
            });
        }
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

    initObservers() {
        const self = this;
        const requestQuery = this.state.requestQuery;

        document.body.addEventListener('pickups-after-choosen', async function (e, data) {

            await self.setState({
                'isLoading': true
            })

            const pkps_location = e.detail;
            const pickupPoint = JSON.stringify(pkps_location);

            const urlParams = new URLSearchParams(requestQuery);

            const response = await fetch(`/api/change-pickup-point?${urlParams}&pickupPoint=${pickupPoint}&automatic=true`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            let pickupPointDescription = response.status !== 200 ? response.statusText : self.pickupRenderDescription(pkps_location);

            self.setState({
                'pickupPoint': pickupPointDescription,
                'isLoading': false
            })
        });
    }

    pickupRenderDescription(pkps_location){
        return "<br /><b>" + pkps_location.title + "</b>&nbsp;(" + pkps_location.iid + ")<br />" + pkps_location.city + ", " + pkps_location.street + "<br /><small>" + pkps_location.zip + "</small>";
    }
}

export default Output;
