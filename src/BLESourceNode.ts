import { DataFrame, SourceNode, SensorSourceOptions } from '@openhps/core';
import { BLEObject, MACAddress, RelativeRSSI } from '@openhps/rf';
import { BLE } from '@awesome-cordova-plugins/ble';

/**
 * BLE source node using cordova-plugin-ibeacon.
 */
export class BLESourceNode extends SourceNode<DataFrame> {
    protected options: BLESourceNodeOptions;

    constructor(options?: BLESourceNodeOptions) {
        super(options);
        this.options.uuids = this.options.uuids || null;
        this.once('build', this._onBleInit.bind(this));
        this.once('destroy', this.stop.bind(this));
    }

    private _onBleInit(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            BLE.enable().then(() => {
                resolve();
            }).catch(reject);
        });
    }

    public stop(): Promise<void> {
        return new Promise<void>((resolve) => {
            BLE.stopScan();
            resolve();
        });
    }

    public start(): Promise<void> {
        return new Promise((resolve) => {
            BLE.stopScan();
            BLE.startScanWithOptions(this.options.uuids, {
                reportDuplicates: true
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
                this.push(frame);
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