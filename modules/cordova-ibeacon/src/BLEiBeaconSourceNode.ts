import { DataFrame, SourceNode, SensorSourceOptions } from '@openhps/core';
import { IBeaconDelegate } from '@awesome-cordova-plugins/ibeacon';
import * as BeaconPlugin from '@awesome-cordova-plugins/ibeacon';
import { BLEiBeacon, BLEObject, BLEUUID, RelativeRSSI } from '@openhps/rf';

export class BLEiBeaconSourceNode extends SourceNode<DataFrame> {
    protected options: iBeaconSourceNodeOptions;
    protected delegate: IBeaconDelegate;
    protected currentRegions: BeaconPlugin.BeaconRegion[] = [];

    constructor(options?: iBeaconSourceNodeOptions) {
        super(options);
        this.options.uuids = this.options.uuids || null;
        this.once('build', this._onBleInit.bind(this));
        this.once('destroy', this.stop.bind(this));
        this.options.source = this.source ?? new BLEObject();
    }

    private _onBleInit(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            BeaconPlugin.IBeacon.requestWhenInUseAuthorization()
                .then(() => {
                    this.delegate = BeaconPlugin.IBeacon.Delegate();
                    resolve();
                })
                .catch(reject);
        });
    }

    public stop(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            Promise.all(
                this.currentRegions.map((region) => {
                    return BeaconPlugin.IBeacon.stopRangingBeaconsInRegion(region);
                }),
            )
                .then(() => {
                    this.currentRegions = [];
                    resolve();
                })
                .catch(reject);
        });
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.currentRegions.length > 0) {
                reject(new Error('Please stop iBeacon scanning before starting a new scan!'));
                return;
            }
            this.currentRegions = this.options.uuids.map((uuid) => {
                return BeaconPlugin.IBeacon.BeaconRegion(uuid, uuid);
            });
            this.delegate.didRangeBeaconsInRegion().subscribe(
                (data: BeaconPlugin.IBeaconPluginResult) => {
                    if (this.options.debug) {
                        console.log(data);
                    }
                    // Check if data is valid
                    if (data === undefined || data.beacons.length === 0) {
                        return;
                    }
                    const frame = new DataFrame();
                    frame.source = this.source;
                    frame.source.relativePositions.forEach((pos) =>
                        frame.source.removeRelativePositions(pos.referenceObjectUID),
                    );

                    data.beacons.forEach((beaconResult) => {
                        const beacon = new BLEiBeacon();
                        beacon.major = beaconResult.major;
                        beacon.minor = beaconResult.minor;
                        beacon.proximityUUID = BLEUUID.fromString(beaconResult.uuid);
                        beacon.txPower = beaconResult.tx;
                        beacon.calibratedRSSI = beaconResult.rssi;
                        beacon.computeUID();
                        frame.addObject(beacon);
                        frame.source.addRelativePosition(new RelativeRSSI(beacon, beaconResult.rssi));
                    });

                    this.push(frame);
                },
                (error: string) => this.logger('error', error),
            );

            BeaconPlugin.IBeacon.setDelegate(this.delegate);
            Promise.all(
                this.currentRegions.map((region) => {
                    return BeaconPlugin.IBeacon.startRangingBeaconsInRegion(region);
                }),
            )
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    this.currentRegions = [];
                    reject(err);
                });
        });
    }

    public onPull(): Promise<DataFrame> {
        return new Promise<DataFrame>((resolve) => {
            resolve(undefined);
        });
    }

    /**
     * Set the Proximity UUIDs for iBeacon scanning.
     * @param uuids
     */
    async setProximityUUIDs(uuids: string[]): Promise<void> {
        this.options.uuids = uuids;
        // Stop (if running)
        if (this.currentRegions.length > 0) {
            await this.stop();
            // Restart
            await this.start();
        }
    }
}

export interface iBeaconSourceNodeOptions extends SensorSourceOptions {
    /**
     * List of Proximity UUIDs that should be included in the result scan.
     */
    uuids?: string[];
    debug?: boolean;
}
