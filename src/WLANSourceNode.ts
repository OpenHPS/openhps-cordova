import { DataFrame, SourceNode, SensorSourceOptions } from '@openhps/core';
import { WLANObject, RelativeRSSI } from '@openhps/rf';

/**
 * WLAN source node
 */
export class WLANSourceNode extends SourceNode<DataFrame> {
    protected WifiWizard2 = require('wifiwizard2');
    protected options: SensorSourceOptions;
    private _timer: number;
    private _running = false;

    constructor(options?: SensorSourceOptions) {
        super(options);
        this.options.interval = this.options.interval || 0;

        this.once('build', this._onWifiInit.bind(this));
        this.once('destroy', this.stop.bind(this));
    }

    private _onWifiInit(): Promise<void> {
        return new Promise((resolve, reject) => {
            document.addEventListener(
                'deviceready',
                function () {
                    this.logger("debug", "Initializing Wi-Fi scanning ...");
                    this.WifiWizard2.isWifiEnabled()
                        .then((status: boolean) => {
                            if (!status) {
                                return reject(new Error(`WiFi not enabled!`));
                            }
                            if (this.options.autoStart) {
                                return this.start();
                            } else {
                                return resolve();
                            }
                        })
                        .catch(reject);
                },
                false,
            );
        });
    }

    public start(): Promise<void> {
        return new Promise<void>((resolve) => {
            // Scan interval
            this._running = true;
            this._timer = setTimeout(this._scan.bind(this), this.options.interval) as any;
            resolve();
        });
    }

    private _scan(): void {
        if (!this._running) {
            return;
        }

        // Keep scan id as timer identifier
        const scanId = this._timer;
        // Load wifi list
        this.WifiWizard2.scan()
            .then((wifiList: Array<any>) => {
                this.push(this.parseList(wifiList));
            })
            .catch((ex: Error) => {
                this.logger('error', 'Unable to perform Wi-Fi scan!', ex);
            })
            .finally(() => {
                if (!this._running || this._timer !== scanId) {
                    return;
                }
                this._timer = setTimeout(this._scan.bind(this), this.options.interval) as any;
            });
    }

    public stop(): Promise<void> {
        return new Promise<void>((resolve) => {
            this._running = false;
            clearTimeout(this._timer);
            this._timer = undefined;
            resolve();
        });
    }

    public parseList(wifiList: Array<any>): DataFrame {
        const frame = new DataFrame();
        frame.source = this.source;
        frame.source.relativePositions.forEach((pos) => frame.source.removeRelativePositions(pos.referenceObjectUID));
        wifiList.forEach((value) => {
            const ap = new WLANObject(value.BSSID);
            ap.displayName = value.SSID;
            ap.frequency = value.frequency;
            ap.capabilities = value.capabilities;
            frame.addObject(ap);
            frame.source.addRelativePosition(new RelativeRSSI(ap, value.level));
        });
        return frame;
    }

    public onPull(): Promise<DataFrame> {
        return new Promise<DataFrame>((resolve, reject) => {
            this.WifiWizard2.scan()
                .then((wifiList: Array<any>) => {
                    resolve(this.parseList(wifiList));
                })
                .catch(reject);
        });
    }
}
