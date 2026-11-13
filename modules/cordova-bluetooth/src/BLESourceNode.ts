import { DataFrame, SourceNode, SensorSourceOptions } from '@openhps/core';
import { BLEObject, MACAddress, RelativeRSSI } from '@openhps/rf';
import { BLE } from '@awesome-cordova-plugins/ble';
import type { Subscription } from 'rxjs';

/**
 * BLE source node using `@awesome-cordova-plugins/ble`.
 */
export class BLESourceNode extends SourceNode<DataFrame> {
    protected options: BLESourceNodeOptions;
    private _subscription: Subscription;

    constructor(options?: BLESourceNodeOptions) {
        super(options);
        this.options.uuids = this.options.uuids ?? [];
        this.options.source = this.source ?? new BLEObject();
        this.once('build', this._onBleInit.bind(this));
        this.once('destroy', this.stop.bind(this));
    }

    private _onBleInit(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            BLE.enable()
                .then(() => {
                    resolve();
                })
                .catch(reject);
        });
    }

    public stop(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this._subscription !== undefined && this._subscription !== null) {
                this._subscription.unsubscribe();
                this._subscription = undefined;
            }
            BLE.stopScan();
            resolve();
        });
    }

    public start(): Promise<void> {
        return new Promise((resolve) => {
            BLE.stopScan();
            this._subscription = BLE.startScanWithOptions(this.options.uuids, {
                reportDuplicates: true,
            }).subscribe((device: BLEDevice) => {
                const frame = new DataFrame();
                const beacon = new BLEObject(MACAddress.fromString(device.id));
                beacon.displayName = device.name;
                beacon.parseScanData(Buffer.from(device.advertising));
                frame.addObject(beacon);

                frame.source = this.source;
                frame.source.relativePositions.forEach((pos) =>
                    frame.source.removeRelativePositions(pos.referenceObjectUID),
                );
                frame.source.addRelativePosition(new RelativeRSSI(beacon, device.rssi));
                this.push(frame).catch((ex) => {
                    this.logger('error', 'Unable to push BLE frame!', ex);
                });
            });
            resolve();
        });
    }

    public onPull(): Promise<DataFrame> {
        return new Promise<DataFrame>((resolve) => {
            resolve(undefined);
        });
    }
}

export interface BLESourceNodeOptions extends SensorSourceOptions {
    /**
     * List of UUIDs that should be included in the result scan.
     */
    uuids?: string[];
}

interface BLEDevice {
    name?: string;
    id: string;
    advertising: ArrayBuffer;
    rssi: number;
}
