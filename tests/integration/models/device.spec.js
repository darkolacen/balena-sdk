import * as _ from 'lodash';
import * as m from 'mochainon';
import * as superagent from 'superagent';

import {
	balena,
	givenADevice,
	givenAnApplication,
	givenAnApplicationWithADevice,
	givenLoggedInUser,
	givenMulticontainerApplication,
	givenInitialOrganization,
	sdkOpts,
	IS_BROWSER,
} from '../setup';

import {
	itShouldSetGetAndRemoveTags,
	itShouldGetAllTagsByResource,
} from './tags';

const { expect } = m.chai;

const makeRequest = (url) =>
	new Promise((resolve) =>
		superagent.get(url).end((
			err,
			res, // have to normalize because of different behaviour in the browser and node
		) =>
			resolve({
				status: res?.status || err.status || 0,
				isError: !!err,
				response: res?.text,
			}),
		),
	);

describe('Device Model', function () {
	givenLoggedInUser(before);

	describe('given no applications', function () {
		describe('balena.models.device.getDisplayName()', function () {
			it('should get the display name for a known slug', function () {
				const promise = balena.models.device.getDisplayName('raspberry-pi2');
				return expect(promise).to.eventually.equal('Raspberry Pi 2');
			});

			it('should get the display name given a device type alias', function () {
				const promise = balena.models.device.getDisplayName('raspberrypi2');
				return expect(promise).to.eventually.equal('Raspberry Pi 2');
			});

			it('should eventually be undefined if the slug is invalid', function () {
				const promise = balena.models.device.getDisplayName('asdf');
				return expect(promise).to.eventually.be.undefined;
			});
		});

		describe('balena.models.device.getDeviceSlug()', function () {
			it('should eventually be the slug from a display name', function () {
				const promise = balena.models.device.getDeviceSlug('Raspberry Pi 2');
				return expect(promise).to.eventually.equal('raspberry-pi2');
			});

			it('should eventually be the slug if passing already a slug', function () {
				const promise = balena.models.device.getDeviceSlug('raspberry-pi2');
				return expect(promise).to.eventually.equal('raspberry-pi2');
			});

			it('should eventually be undefined if the display name is invalid', function () {
				const promise = balena.models.device.getDeviceSlug('asdf');
				return expect(promise).to.eventually.be.undefined;
			});

			it('should eventually be the slug if passing an alias', function () {
				const promise = balena.models.device.getDeviceSlug('raspberrypi2');
				return expect(promise).to.eventually.equal('raspberry-pi2');
			});
		});

		describe('balena.models.device.getSupportedDeviceTypes()', function () {
			it('should return a non empty array', () =>
				balena.models.device
					.getSupportedDeviceTypes()
					.then(function (deviceTypes) {
						expect(Array.isArray(deviceTypes)).to.be.true;
						return expect(deviceTypes).to.not.have.length(0);
					}));

			it('should return all valid display names', async () => {
				const deviceTypes = await balena.models.device.getSupportedDeviceTypes();
				for (const deviceType of deviceTypes) {
					const promise = balena.models.device.getDeviceSlug(deviceType);
					await expect(promise).to.eventually.not.be.undefined;
				}
			});
		});

		describe('balena.models.device.getManifestBySlug()', function () {
			it('should become the manifest if the slug is valid', () =>
				balena.models.device
					.getManifestBySlug('raspberry-pi')
					.then(function (manifest) {
						expect(_.isPlainObject(manifest)).to.be.true;
						expect(manifest.slug).to.exist;
						expect(manifest.name).to.exist;
						return expect(manifest.options).to.exist;
					}));

			it('should be rejected if the device slug is invalid', function () {
				const promise = balena.models.device.getManifestBySlug('foobar');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Invalid device type: foobar');
			});

			it('should become the manifest given a device type alias', () =>
				balena.models.device
					.getManifestBySlug('raspberrypi')
					.then((manifest) => expect(manifest.slug).to.equal('raspberry-pi')));
		});
	});

	describe('given a single application without devices', function () {
		describe('[read operations]', function () {
			givenAnApplication(before);

			describe('balena.models.device.getAll()', () =>
				it('should become an empty array', function () {
					const promise = balena.models.device.getAll();
					return expect(promise).to.become([]);
				}));

			describe('balena.models.device.getAllByApplication()', () =>
				it('should become an empty array', function () {
					const promise = balena.models.device.getAllByApplication(
						this.application.id,
					);
					return expect(promise).to.become([]);
				}));

			describe('balena.models.device.generateUniqueKey()', function () {
				it('should generate a valid uuid', function () {
					const uuid = balena.models.device.generateUniqueKey();

					expect(uuid).to.be.a('string');
					expect(uuid).to.have.length(32);
					return expect(uuid).to.match(/^[a-z0-9]{32}$/);
				});

				it('should generate different uuids', function () {
					const one = balena.models.device.generateUniqueKey();
					const two = balena.models.device.generateUniqueKey();
					const three = balena.models.device.generateUniqueKey();

					expect(one).to.not.equal(two);
					return expect(two).to.not.equal(three);
				});
			});

			describe('balena.models.device.getManifestByApplication()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should return the appropriate manifest for an application ${prop}`, function () {
						return balena.models.device
							.getManifestByApplication(this.application[prop])
							.then((manifest) => {
								return m.chai
									.expect(manifest.slug)
									.to.equal(this.applicationDeviceType.slug);
							});
					}),
				);

				it('should be rejected if the application name does not exist', function () {
					const promise = balena.models.device.getManifestByApplication(
						'HelloWorldApp',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: HelloWorldApp');
				});

				it('should be rejected if the application id does not exist', function () {
					const promise = balena.models.device.getManifestByApplication(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: 999999');
				});
			});
		});

		describe('balena.models.device.register()', function () {
			givenAnApplication(beforeEach);

			['id', 'app_name', 'slug'].forEach((prop) =>
				it(`should be able to register a device to a valid application ${prop}`, function () {
					const uuid = balena.models.device.generateUniqueKey();
					return balena.models.device
						.register(this.application[prop], uuid)
						.then(() => {
							const promise = balena.models.device.getAllByApplication(
								this.application.app_name,
							);
							return expect(promise).to.eventually.have.length(1);
						});
				}),
			);

			it('should become valid device registration info', function () {
				const uuid = balena.models.device.generateUniqueKey();
				return balena.models.device
					.register(this.application.id, uuid)
					.then(function (deviceInfo) {
						expect(deviceInfo.uuid).to.equal(uuid);
						return expect(deviceInfo.api_key).to.be.a('string');
					});
			});

			it('should be rejected if the application name does not exist', function () {
				const uuid = balena.models.device.generateUniqueKey();
				const promise = balena.models.device.register('HelloWorldApp', uuid);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Application not found: HelloWorldApp');
			});

			it('should be rejected if the application id does not exist', function () {
				const uuid = balena.models.device.generateUniqueKey();
				const promise = balena.models.device.register(999999, uuid);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Application not found: 999999');
			});
		});
	});

	describe('given a single application with a single offline device', function () {
		describe('[read operations]', function () {
			givenAnApplicationWithADevice(before);

			describe('balena.models.device.getAll()', function () {
				it('should become the device', function () {
					return balena.models.device.getAll().then((devices) => {
						expect(devices).to.have.length(1);
						return expect(devices[0].id).to.equal(this.device.id);
					});
				});

				it('should support arbitrary pinejs options', function () {
					return balena.models.device
						.getAll({ $select: ['id'] })
						.then(([device]) => {
							expect(device.id).to.equal(this.device.id);
							return expect(device.device_name).to.equal(undefined);
						});
				});

				it('should be able to retrieve computed terms', () =>
					balena.models.device
						.getAll({ $select: ['overall_status', 'overall_progress'] })
						.then(function ([device]) {
							return expect(device).to.deep.match({
								overall_status: 'inactive',
								overall_progress: null,
							});
						}));
			});

			describe('balena.models.device.getAllByApplication()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should get the device given the right application ${prop}`, function () {
						return balena.models.device
							.getAllByApplication(this.application[prop])
							.then((devices) => {
								expect(devices).to.have.length(1);
								return expect(devices[0].id).to.equal(this.device.id);
							});
					}),
				);

				it('should be rejected if the application name does not exist', function () {
					const promise = balena.models.device.getAllByApplication(
						'HelloWorldApp',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: HelloWorldApp');
				});

				it('should be rejected if the application id does not exist', function () {
					const promise = balena.models.device.getAllByApplication(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: 999999');
				});

				it('should support arbitrary pinejs options', function () {
					return balena.models.device
						.getAllByApplication(this.application.id, { $select: ['id'] })
						.then(([device]) => {
							expect(device.id).to.equal(this.device.id);
							return expect(device.device_name).to.equal(undefined);
						});
				});

				it('should be able to retrieve computed terms', function () {
					return balena.models.device
						.getAllByApplication(this.application.id, {
							$select: ['overall_status', 'overall_progress'],
						})
						.then(function ([device]) {
							return expect(device).to.deep.match({
								overall_status: 'inactive',
								overall_progress: null,
							});
						});
				});
			});

			describe('balena.models.device.get()', function () {
				it('should be able to get the device by uuid', function () {
					return balena.models.device.get(this.device.uuid).then((device) => {
						return expect(device.id).to.equal(this.device.id);
					});
				});

				it('should be able to get the device by id', function () {
					return balena.models.device.get(this.device.id).then((device) => {
						return expect(device.id).to.equal(this.device.id);
					});
				});

				it('should be rejected if the device name does not exist', function () {
					const promise = balena.models.device.get('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.get(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});

				it('should be able to use a shorter uuid', function () {
					return balena.models.device
						.get(this.device.uuid.slice(0, 8))
						.then((device) => {
							return expect(device.id).to.equal(this.device.id);
						});
				});

				it('should support arbitrary pinejs options', function () {
					return balena.models.device
						.get(this.device.id, { $select: ['id'] })
						.then((device) => {
							expect(device.id).to.equal(this.device.id);
							return expect(device.device_name).to.equal(undefined);
						});
				});

				it('should be able to retrieve computed terms', function () {
					return balena.models.device
						.get(this.device.uuid, {
							$select: ['overall_status', 'overall_progress'],
						})
						.then((device) =>
							expect(device).to.deep.match({
								overall_status: 'inactive',
								overall_progress: null,
							}),
						);
				});
			});

			describe('balena.models.device.getByName()', function () {
				it('should be able to get the device', function () {
					return balena.models.device
						.getByName(this.device.device_name)
						.then((devices) => {
							expect(devices).to.have.length(1);
							return expect(devices[0].id).to.equal(this.device.id);
						});
				});

				it('should be rejected if the device does not exist', function () {
					const promise = balena.models.device.getByName('HelloWorldDevice');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: HelloWorldDevice');
				});

				it('should support arbitrary pinejs options', function () {
					return balena.models.device
						.getByName(this.device.device_name, { $select: ['id'] })
						.then(([device]) => {
							expect(device.id).to.equal(this.device.id);
							return expect(device.device_name).to.equal(undefined);
						});
				});
			});

			describe('balena.models.device.getName()', function () {
				it('should get the correct name by uuid', function () {
					const promise = balena.models.device.getName(this.device.uuid);
					return m.chai
						.expect(promise)
						.to.eventually.equal(this.device.device_name);
				});

				it('should get the correct name by id', function () {
					const promise = balena.models.device.getName(this.device.id);
					return m.chai
						.expect(promise)
						.to.eventually.equal(this.device.device_name);
				});

				it('should be rejected if the device uuid does not exist', function () {
					const promise = balena.models.device.getName('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.getName(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});
			});

			describe('balena.models.device.getApplicationName()', function () {
				it('should get the correct application name from a device uuid', function () {
					const promise = balena.models.device.getApplicationName(
						this.device.uuid,
					);
					return m.chai
						.expect(promise)
						.to.eventually.equal(this.application.app_name);
				});

				it('should get the correct application name from a device id', function () {
					const promise = balena.models.device.getApplicationName(
						this.device.id,
					);
					return m.chai
						.expect(promise)
						.to.eventually.equal(this.application.app_name);
				});

				it('should be rejected if the device uuid does not exist', function () {
					const promise = balena.models.device.getApplicationName('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.getApplicationName(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});
			});

			describe('balena.models.device.has()', function () {
				it('should eventually be true if the device uuid exists', function () {
					const promise = balena.models.device.has(this.device.uuid);
					return expect(promise).to.eventually.be.true;
				});

				it('should eventually be true if the device id exists', function () {
					const promise = balena.models.device.has(this.device.id);
					return expect(promise).to.eventually.be.true;
				});

				it('should return false if the device id is undefined', function () {
					// @ts-expect-error
					const promise = balena.models.application.has(undefined);
					return expect(promise).to.eventually.be.false;
				});

				it('should eventually be false if the device uuid does not exist', function () {
					const promise = balena.models.device.has('asdfghjkl');
					return expect(promise).to.eventually.be.false;
				});

				it('should eventually be false if the device id does not exist', function () {
					const promise = balena.models.device.has(999999);
					return expect(promise).to.eventually.be.false;
				});
			});

			describe('balena.models.device.isOnline()', function () {
				it('should eventually be false if the device uuid is offline', function () {
					const promise = balena.models.device.isOnline(this.device.uuid);
					return expect(promise).to.eventually.be.false;
				});

				it('should eventually be false if the device id is offline', function () {
					const promise = balena.models.device.isOnline(this.device.id);
					return expect(promise).to.eventually.be.false;
				});

				it('should be rejected if the device uuid does not exist', function () {
					const promise = balena.models.device.isOnline('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.isOnline(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});
			});

			describe('balena.models.device.getLocalIPAddresses()', function () {
				it('should be rejected with an offline error if the device uuid is offline', function () {
					const promise = balena.models.device.getLocalIPAddresses(
						this.device.uuid,
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(`The device is offline: ${this.device.uuid}`);
				});

				it('should be rejected with an offline error if the device id is offline', function () {
					const promise = balena.models.device.getLocalIPAddresses(
						this.device.id,
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(`The device is offline: ${this.device.id}`);
				});

				it('should be rejected if the device uuid does not exist', function () {
					const promise = balena.models.device.getLocalIPAddresses('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.getLocalIPAddresses(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});
			});

			describe('balena.models.device.getMACAddresses()', function () {
				it('should be rejected if the device uuid does not exist', function () {
					const promise = balena.models.device.getMACAddresses('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.getMACAddresses(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});

				['id', 'uuid'].forEach((field) =>
					it(`should retrieve a empty list of mac addresses by ${field}`, function () {
						return balena.models.device
							.getMACAddresses(this.device[field])
							.then((result) => expect(result).to.deep.equal([]));
					}),
				);
			});

			describe('balena.models.device.getAllByParentDevice()', function () {
				givenInitialOrganization(before);

				before(async function () {
					const [userId, childApplication] = await Promise.all([
						balena.auth.getUserId(),
						balena.models.application.create({
							name: 'ChildApp',
							applicationType: 'microservices-starter',
							deviceType: 'generic',
							organization: this.initialOrg.id,
							parent: this.application.id,
						}),
					]);
					// We don't use the built-in .register or resin-register-device,
					// because they don't yet support parent devices.
					this.childApplication = childApplication;
					this.childDevice = await balena.pine.post({
						resource: 'device',
						body: {
							belongs_to__user: userId,
							belongs_to__application: this.childApplication.id,
							is_of__device_type: this.childApplication.is_for__device_type
								.__id,
							uuid: balena.models.device.generateUniqueKey(),
							is_managed_by__device: this.device.id,
						},
					});
				});

				after(() => balena.models.application.remove('ChildApp'));

				it('should get the device given the right parent uuid', function () {
					return balena.models.device
						.getAllByParentDevice(this.device.uuid)
						.then((childDevices) => {
							expect(childDevices).to.have.length(1);
							return m.chai
								.expect(childDevices[0].id)
								.to.equal(this.childDevice.id);
						});
				});

				it('should get the device given the right parent id', function () {
					return balena.models.device
						.getAllByParentDevice(this.device.id)
						.then((childDevices) => {
							expect(childDevices).to.have.length(1);
							return m.chai
								.expect(childDevices[0].id)
								.to.equal(this.childDevice.id);
						});
				});

				it('should be empty if the parent device has no children', function () {
					return balena.models.device
						.getAllByParentDevice(this.childDevice.id)
						.then((childDevices) => expect(childDevices).to.have.length(0));
				});

				it('should be rejected if the parent device does not exist', function () {
					const promise = balena.models.device.getAllByParentDevice(
						'asdfghjkl',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should support arbitrary pinejs options', function () {
					return balena.models.device
						.getAllByParentDevice(this.device.id, { $select: ['id'] })
						.then(([childDevice]) => {
							expect(childDevice.id).to.equal(this.childDevice.id);
							return expect(childDevice.device_name).to.equal(undefined);
						});
				});
			});
		});

		describe('balena.models.device.getMACAddresses()', function () {
			givenAnApplication(before);
			givenADevice(before, {
				mac_address: '00:11:22:33:44:55 66:77:88:99:AA:BB',
			});

			['id', 'uuid'].forEach((field) =>
				it(`should be able to retrieve the device mac addresses by ${field}`, function () {
					return balena.models.device
						.getMACAddresses(this.device[field])
						.then((result) =>
							m.chai
								.expect(result)
								.to.deep.equal(['00:11:22:33:44:55', '66:77:88:99:AA:BB']),
						);
				}),
			);
		});

		describe('balena.models.device.remove()', function () {
			givenAnApplication(before);

			givenADevice(beforeEach);

			it('should be able to remove the device by uuid', function () {
				return balena.models.device
					.remove(this.device.uuid)
					.then(() => balena.models.device.getAll())
					.then((devices) => expect(devices).to.deep.equal([]));
			});

			it('should be able to remove the device by id', function () {
				return balena.models.device
					.remove(this.device.id)
					.then(() => balena.models.device.getAll())
					.then((devices) => expect(devices).to.deep.equal([]));
			});

			it('should be able to remove the device using a shorter uuid', function () {
				return balena.models.device
					.remove(this.device.uuid.slice(0, 7))
					.then(() => balena.models.device.getAll())
					.then((devices) => expect(devices).to.deep.equal([]));
			});

			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.remove('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.remove(999999);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});
		});

		describe('balena.models.device.rename()', function () {
			givenAnApplication(before);

			givenADevice(beforeEach);

			it('should be able to rename the device by uuid', function () {
				return balena.models.device
					.rename(this.device.uuid, 'FooBarDeviceByUuid')
					.then(() => {
						return balena.models.device.getName(this.device.uuid);
					})
					.then((name) => expect(name).to.equal('FooBarDeviceByUuid'));
			});

			it('should be able to rename the device by id', function () {
				return balena.models.device
					.rename(this.device.id, 'FooBarDeviceById')
					.then(() => {
						return balena.models.device.getName(this.device.id);
					})
					.then((name) => expect(name).to.equal('FooBarDeviceById'));
			});

			it('should be able to rename the device using a shorter uuid', function () {
				return balena.models.device
					.rename(this.device.uuid.slice(0, 7), 'FooBarDeviceByShortUuid')
					.then(() => {
						return balena.models.device.getName(this.device.uuid);
					})
					.then((name) => expect(name).to.equal('FooBarDeviceByShortUuid'));
			});

			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.rename('asdfghjkl', 'Foo Bar');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.rename(999999, 'Foo Bar');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});
		});

		describe('balena.models.device.setCustomLocation()', function () {
			givenAnApplicationWithADevice(before);

			it('should be able to set the location of a device by uuid', function () {
				return balena.models.device
					.setCustomLocation(this.device.uuid, {
						latitude: 41.383333,
						longitude: 2.183333,
					})
					.then(() => {
						return balena.models.device.get(this.device.id, {
							$select: ['custom_latitude', 'custom_longitude'],
						});
					})
					.then(function (device) {
						expect(device.custom_latitude).to.equal('41.383333');
						return expect(device.custom_longitude).to.equal('2.183333');
					});
			});

			it('should be able to set the location of a device by id', function () {
				return balena.models.device
					.setCustomLocation(this.device.id, {
						latitude: 42.383333,
						longitude: 2.283333,
					})
					.then(() => {
						return balena.models.device.get(this.device.id, {
							$select: ['custom_latitude', 'custom_longitude'],
						});
					})
					.then(function (device) {
						expect(device.custom_latitude).to.equal('42.383333');
						return expect(device.custom_longitude).to.equal('2.283333');
					});
			});

			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.setCustomLocation('asdfghjkl', {
					latitude: 43.383333,
					longitude: 2.383333,
				});
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.setCustomLocation(999999, {
					latitude: 44.383333,
					longitude: 2.483333,
				});
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});
		});

		describe('balena.models.device.unsetCustomLocation()', function () {
			givenAnApplicationWithADevice(before);

			beforeEach(function () {
				return balena.models.device.setCustomLocation(this.device.id, {
					latitude: 41.383333,
					longitude: 2.183333,
				});
			});

			it('should be able to unset the location of a device by uuid', function () {
				return balena.models.device
					.unsetCustomLocation(this.device.uuid)
					.then(() => {
						return balena.models.device.get(this.device.id, {
							$select: ['custom_latitude', 'custom_longitude'],
						});
					})
					.then(function (device) {
						expect(device.custom_latitude).to.equal('');
						return expect(device.custom_longitude).to.equal('');
					});
			});

			it('should be able to unset the location of a device by id', function () {
				return balena.models.device
					.unsetCustomLocation(this.device.id)
					.then(() => {
						return balena.models.device.get(this.device.id, {
							$select: ['custom_latitude', 'custom_longitude'],
						});
					})
					.then(function (device) {
						expect(device.custom_latitude).to.equal('');
						return expect(device.custom_longitude).to.equal('');
					});
			});

			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.unsetCustomLocation('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.unsetCustomLocation(999999);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});
		});

		describe('balena.models.device.note()', function () {
			givenAnApplication(before);

			givenADevice(beforeEach);

			it('should be able to note a device by uuid', function () {
				return balena.models.device
					.note(
						this.device.uuid,
						'What you do today can improve all your tomorrows',
					)
					.then(() => {
						return balena.models.device.get(this.device.uuid);
					})
					.then((device) =>
						m.chai
							.expect(device.note)
							.to.equal('What you do today can improve all your tomorrows'),
					);
			});

			it('should be able to note a device by id', function () {
				return balena.models.device
					.note(
						this.device.id,
						'What you do today can improve all your tomorrows',
					)
					.then(() => {
						return balena.models.device.get(this.device.id);
					})
					.then((device) =>
						m.chai
							.expect(device.note)
							.to.equal('What you do today can improve all your tomorrows'),
					);
			});

			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.note('asdfghjkl', 'My note');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.note(999999, 'My note');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});
		});

		describe('balena.models.device.hasDeviceUrl()', function () {
			givenAnApplicationWithADevice(before);

			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.hasDeviceUrl('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.hasDeviceUrl(999999);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});

			describe('given device url is disabled', function () {
				it('should eventually be false given a device uuid', function () {
					const promise = balena.models.device.hasDeviceUrl(this.device.uuid);
					return expect(promise).to.eventually.be.false;
				});

				it('should eventually be false given a device id', function () {
					const promise = balena.models.device.hasDeviceUrl(this.device.id);
					return expect(promise).to.eventually.be.false;
				});
			});

			describe('given device url is enabled', function () {
				before(function () {
					return balena.models.device.enableDeviceUrl(this.device.id);
				});

				it('should eventually be true given a device uuid', function () {
					const promise = balena.models.device.hasDeviceUrl(this.device.uuid);
					return expect(promise).to.eventually.be.true;
				});

				it('should eventually be true given a device id', function () {
					const promise = balena.models.device.hasDeviceUrl(this.device.id);
					return expect(promise).to.eventually.be.true;
				});
			});
		});

		describe('balena.models.device.getDeviceUrl()', function () {
			givenAnApplicationWithADevice(before);

			describe('given a newly created device', function () {
				it('should be rejected if the device uuid does not exist', function () {
					const promise = balena.models.device.getDeviceUrl('asdfghjkl');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.getDeviceUrl(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});
			});

			describe('given device url is disabled', function () {
				it('should be rejected with an error given a device uuid', function () {
					const promise = balena.models.device.getDeviceUrl(this.device.uuid);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							`Device is not web accessible: ${this.device.uuid}`,
						);
				});

				it('should be rejected with an error given a device id', function () {
					const promise = balena.models.device.getDeviceUrl(this.device.id);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							`Device is not web accessible: ${this.device.id}`,
						);
				});
			});

			describe('given device url is enabled', function () {
				before(function () {
					return balena.models.device.enableDeviceUrl(this.device.id);
				});

				it('should eventually return the correct device url given a shorter uuid', function () {
					return balena.models.device
						.getDeviceUrl(this.device.uuid.slice(0, 7))
						.then((deviceUrl) => expect(deviceUrl).to.match(/[a-z0-9]{32}/));
				});

				it('should eventually return the correct device url given an id', function () {
					return balena.models.device
						.getDeviceUrl(this.device.id)
						.then((deviceUrl) => expect(deviceUrl).to.match(/[a-z0-9]{32}/));
				});

				it('should eventually be an absolute url given a uuid', function () {
					return balena.models.device
						.getDeviceUrl(this.device.uuid)
						.then(makeRequest)
						.then(function (response) {
							expect(response.isError).to.equal(true);

							// in the browser we don't get the details
							// honestly it's unclear why, as it works for other services
							if (IS_BROWSER) {
								return;
							}

							// Because the device is not online
							expect(response.status).to.equal(503);

							return m.chai
								.expect(response.response)
								.to.match(/Device Public URLs/);
						});
				});
			});
		});

		describe('balena.models.device.enableDeviceUrl()', function () {
			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.enableDeviceUrl('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.enableDeviceUrl(999999);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});

			describe('given the device url is disabled', function () {
				givenAnApplication(before);

				givenADevice(beforeEach);

				it('should be able to enable web access using a uuid', function () {
					return balena.models.device
						.enableDeviceUrl(this.device.uuid)
						.then(() => {
							const promise = balena.models.device.hasDeviceUrl(this.device.id);
							return expect(promise).to.eventually.be.true;
						});
				});

				it('should be able to enable web access using an id', function () {
					return balena.models.device
						.enableDeviceUrl(this.device.id)
						.then(() => {
							const promise = balena.models.device.hasDeviceUrl(this.device.id);
							return expect(promise).to.eventually.be.true;
						});
				});

				it('should be able to enable web access using a shorter uuid', function () {
					return balena.models.device
						.enableDeviceUrl(this.device.uuid.slice(0, 7))
						.then(() => {
							const promise = balena.models.device.hasDeviceUrl(this.device.id);
							return expect(promise).to.eventually.be.true;
						});
				});
			});
		});

		describe('balena.models.device.disableDeviceUrl()', function () {
			it('should be rejected if the device uuid does not exist', function () {
				const promise = balena.models.device.disableDeviceUrl('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.disableDeviceUrl(999999);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});

			describe('given device url is enabled', function () {
				givenAnApplication(before);

				givenADevice(beforeEach);

				beforeEach(function () {
					return balena.models.device.enableDeviceUrl(this.device.id);
				});

				it('should be able to disable web access using a uuid', function () {
					return balena.models.device
						.disableDeviceUrl(this.device.uuid)
						.then(() => {
							const promise = balena.models.device.hasDeviceUrl(this.device.id);
							return expect(promise).to.eventually.be.false;
						});
				});

				it('should be able to disable web access using an id', function () {
					return balena.models.device
						.disableDeviceUrl(this.device.id)
						.then(() => {
							const promise = balena.models.device.hasDeviceUrl(this.device.id);
							return expect(promise).to.eventually.be.false;
						});
				});

				it('should be able to disable web access using a shorter uuid', function () {
					return balena.models.device
						.disableDeviceUrl(this.device.uuid.slice(0, 7))
						.then(() => {
							const promise = balena.models.device.hasDeviceUrl(this.device.id);
							return expect(promise).to.eventually.be.false;
						});
				});
			});
		});

		describe('balena.models.device.generateDeviceKey()', function () {
			givenAnApplicationWithADevice(before);

			it('should be able to generate a device key by uuid', function () {
				return balena.models.device
					.generateDeviceKey(this.device.uuid)
					.then(function (deviceApiKey) {
						expect(deviceApiKey).to.be.a('string');
						return expect(deviceApiKey).to.have.length(32);
					});
			});

			it('should be able to generate a device key by id', function () {
				return balena.models.device
					.generateDeviceKey(this.device.id)
					.then(function (deviceApiKey) {
						expect(deviceApiKey).to.be.a('string');
						return expect(deviceApiKey).to.have.length(32);
					});
			});

			it('should be rejected if the device name does not exist', function () {
				const promise = balena.models.device.generateDeviceKey('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device id does not exist', function () {
				const promise = balena.models.device.generateDeviceKey(999999);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: 999999');
			});

			it('should be able to use a shorter uuid', function () {
				return balena.models.device
					.generateDeviceKey(this.device.uuid.slice(0, 8))
					.then(function (deviceApiKey) {
						expect(deviceApiKey).to.be.a('string');
						return expect(deviceApiKey).to.have.length(32);
					});
			});
		});

		describe('balena.models.device.grantSupportAccess()', function () {
			givenAnApplicationWithADevice(before);

			it('should throw an error if the expiry time stamp is in the past', function () {
				const expiryTimestamp = Date.now() - 3600 * 1000;

				return m.chai
					.expect(() =>
						balena.models.device.grantSupportAccess(
							this.device.id,
							expiryTimestamp,
						),
					)
					.to.throw();
			});

			it('should throw an error if the expiry time stamp is undefined', function () {
				return m.chai
					.expect(() =>
						// @ts-expect-error
						balena.models.device.grantSupportAccess(this.device.id),
					)
					.to.throw();
			});

			it('should grant support access for the correct amount of time', function () {
				const expiryTimestamp = Date.now() + 3600 * 1000;
				const promise = balena.models.device
					.grantSupportAccess(this.device.id, expiryTimestamp)
					.then(() => {
						return balena.models.device.get(this.device.id, {
							$select: 'is_accessible_by_support_until__date',
						});
					})
					.then(({ is_accessible_by_support_until__date }) =>
						Date.parse(is_accessible_by_support_until__date),
					);

				return expect(promise).to.eventually.equal(expiryTimestamp);
			});
		});

		describe('balena.models.device.revokeSupportAccess()', function () {
			givenAnApplicationWithADevice(before);

			before(function () {
				return balena.models.device.grantSupportAccess(
					this.device.id,
					Date.now() + 3600 * 1000,
				);
			});

			it('should revoke support access', function () {
				return balena.models.device
					.revokeSupportAccess(this.device.id)
					.then(() => {
						return balena.models.device.get(this.device.id, {
							$select: 'is_accessible_by_support_until__date',
						});
					})
					.then(
						({ is_accessible_by_support_until__date }) =>
							expect(is_accessible_by_support_until__date).to.be.null,
					);
			});
		});

		describe('Given a device with a production image', function () {
			givenAnApplication(before);
			givenADevice(before, {
				is_online: true,
				os_variant: 'prod',
				os_version: 'Resin OS 2.7.8+rev1',
				supervisor_version: '6.4.2',
				last_connectivity_event: '2019-05-13T16:14',
			});

			describe('balena.models.device.getLocalModeSupport()', () =>
				it('should identify the device as not supported', function () {
					return m.chai
						.expect(balena.models.device.getLocalModeSupport(this.device))
						.to.deep.equal({
							supported: false,
							message:
								'Local mode is only supported on development OS versions',
						});
				}));

			describe('balena.models.device.isInLocalMode()', function () {
				it('should be false by default for a device retrieved by uuid', function () {
					return balena.models.device
						.isInLocalMode(this.device.uuid)
						.then((isInLocalMode) => expect(isInLocalMode).to.be.false);
				});

				it('should be false by default for a device retrieved by id', function () {
					return balena.models.device
						.isInLocalMode(this.device.id)
						.then((isInLocalMode) => expect(isInLocalMode).to.be.false);
				});
			});

			describe('balena.models.device.enableLocalMode()', function () {
				it('should not be able to enable local mode by uuid', function () {
					const promise = balena.models.device.enableLocalMode(
						this.device.uuid,
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							'Local mode is only supported on development OS versions',
						);
				});

				it('should not be able to enable local mode by id', function () {
					const promise = balena.models.device.enableLocalMode(this.device.id);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							'Local mode is only supported on development OS versions',
						);
				});
			});
		});

		describe('Given a device with a development image', function () {
			givenAnApplication(before);
			givenADevice(before, {
				is_online: true,
				os_variant: 'dev',
				os_version: 'Resin OS 2.7.8+rev1',
				supervisor_version: '6.4.2',
				last_connectivity_event: '2019-05-13T16:14',
			});

			describe('balena.models.device.getLocalModeSupport()', () =>
				it('should identify the device as supported', function () {
					return m.chai
						.expect(balena.models.device.getLocalModeSupport(this.device))
						.to.deep.equal({
							supported: true,
							message: 'Supported',
						});
				}));

			describe('[mutating operations]', () =>
				['id', 'uuid'].forEach(function (deviceParam) {
					describe('balena.models.device.isInLocalMode()', function () {
						it(`should be false by default for a device retrieved by ${deviceParam}`, function () {
							return balena.models.device
								.isInLocalMode(this.device[deviceParam])
								.then((isInLocalMode) => expect(isInLocalMode).to.be.false);
						});

						it(`should be rejected if a device with that ${deviceParam} does not exist`, function () {
							const deviceParamValue =
								deviceParam === 'id' ? 999999 : 'asdfghjkl';
							const promise = balena.models.device.isInLocalMode(
								deviceParamValue,
							);
							return m.chai
								.expect(promise)
								.to.be.rejectedWith(`Device not found: ${deviceParamValue}`);
						});
					});

					describe('balena.models.device.enableLocalMode()', function () {
						it(`should be able to enable local mode by ${deviceParam}`, function () {
							return balena.models.device
								.enableLocalMode(this.device[deviceParam])
								.then(() => {
									return balena.models.device.isInLocalMode(
										this.device[deviceParam],
									);
								})
								.then((isInLocalMode) => expect(isInLocalMode).to.be.true);
						});

						it(`should be rejected if a device with that ${deviceParam} does not exist`, function () {
							const deviceParamValue =
								deviceParam === 'id' ? 999999 : 'asdfghjkl';
							const promise = balena.models.device.enableLocalMode(
								deviceParamValue,
							);
							return m.chai
								.expect(promise)
								.to.be.rejectedWith(`Device not found: ${deviceParamValue}`);
						});
					});

					describe('balena.models.device.disableLocalMode()', function () {
						it(`should be able to disable local mode by ${deviceParam}`, function () {
							return balena.models.device
								.disableLocalMode(this.device[deviceParam])
								.then(() => {
									return balena.models.device.isInLocalMode(
										this.device[deviceParam],
									);
								})
								.then((isInLocalMode) => expect(isInLocalMode).to.be.false);
						});

						it(`should be rejected if a device with that ${deviceParam} does not exist`, function () {
							const deviceParamValue =
								deviceParam === 'id' ? 999999 : 'asdfghjkl';
							const promise = balena.models.device.disableLocalMode(
								deviceParamValue,
							);
							return m.chai
								.expect(promise)
								.to.be.rejectedWith(`Device not found: ${deviceParamValue}`);
						});
					});
				}));
		});

		describe('balena.models.device.hasLockOverride()', function () {
			givenAnApplicationWithADevice(before);

			it('should be false by default for a device retrieved by uuid', function () {
				return balena.models.device
					.hasLockOverride(this.device.uuid)
					.then((hasLockOverride) => expect(hasLockOverride).to.be.false);
			});

			it('should be false by default for a device retrieved by id', function () {
				return balena.models.device
					.hasLockOverride(this.device.id)
					.then((hasLockOverride) => expect(hasLockOverride).to.be.false);
			});
		});

		describe('balena.models.device.enableLockOverride()', function () {
			givenAnApplication(before);

			givenADevice(beforeEach);

			it('should be able to enable lock override by uuid', function () {
				return balena.models.device
					.enableLockOverride(this.device.uuid)
					.then(() => {
						return balena.models.device.hasLockOverride(this.device.uuid);
					})
					.then((hasLockOverride) => expect(hasLockOverride).to.be.true);
			});

			it('should be able to enable lock override by id', function () {
				return balena.models.device
					.enableLockOverride(this.device.id)
					.then(() => {
						return balena.models.device.hasLockOverride(this.device.id);
					})
					.then((hasLockOverride) => expect(hasLockOverride).to.be.true);
			});
		});

		describe('balena.models.device.disableLockOverride()', function () {
			givenAnApplication(before);

			givenADevice(beforeEach);

			beforeEach(function () {
				return balena.models.device.enableLockOverride(this.device.uuid);
			});

			it('should be able to disable lock override by uuid', function () {
				return balena.models.device
					.disableLockOverride(this.device.uuid)
					.then(() => {
						return balena.models.device.hasLockOverride(this.device.uuid);
					})
					.then((hasLockOverride) => expect(hasLockOverride).to.be.false);
			});

			it('should be able to disable lock override by id', function () {
				return balena.models.device
					.disableLockOverride(this.device.id)
					.then(() => {
						return balena.models.device.hasLockOverride(this.device.id);
					})
					.then((hasLockOverride) => expect(hasLockOverride).to.be.false);
			});
		});

		describe('balena.models.device.getOsUpdateStatus()', function () {
			givenAnApplicationWithADevice(before);

			it('should be able to get the current OS update status', function () {
				return balena.models.device
					.getOsUpdateStatus(this.device.uuid)
					.then((status) =>
						expect(status).to.deep.match({
							status: 'idle',
						}),
					);
			});

			it('should be rejected if the device does not exist', function () {
				const promise = balena.models.device.getOsUpdateStatus('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});
		});

		describe('balena.models.device.startOsUpdate()', function () {
			givenAnApplicationWithADevice(before);

			describe('given an offline device w/o os info', function () {
				it('should be rejected if the device does not exist', function () {
					const promise = balena.models.device.startOsUpdate(
						'asdfghjkl',
						'2.29.2+rev1.prod',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should not be able to start an OS update without providing a targetOsVersion parameter', function () {
					// @ts-expect-error
					const promise = balena.models.device.startOsUpdate(this.device.uuid);
					return m.chai
						.expect(promise)
						.to.be.rejected.and.eventually.have.property(
							'code',
							'BalenaInvalidParameterError',
						);
				});

				it('should not be able to start an OS update for an offline device', function () {
					const promise = balena.models.device.startOsUpdate(
						this.device.uuid,
						'2.29.2+rev1.prod',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(`The device is offline: ${this.device.uuid}`);
				});
			});

			describe('given an online device w/o os info', function () {
				before(function () {
					return balena.pine.patch({
						resource: 'device',
						id: this.device.id,
						body: { is_online: true },
					});
				});

				it('should not be able to start an OS update for a device that has not yet reported its current version', function () {
					const promise = balena.models.device.startOsUpdate(
						this.device.uuid,
						'2.29.2+rev1.prod',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							`The current os version of the device is not available: ${this.device.uuid}`,
						);
				});
			});

			describe('given an online device with os info', function () {
				before(function () {
					return balena.pine.patch({
						resource: 'device',
						id: this.device.id,
						body: {
							is_online: true,
							os_variant: 'prod',
							os_version: 'Resin OS 2.7.8+rev1',
						},
					});
				});

				it('should not be able to start an OS update when the target os version is not specified', function () {
					// @ts-expect-error
					const promise = balena.models.device.startOsUpdate(this.device.uuid);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							"undefined is not a valid value for parameter 'targetOsVersion'",
						)
						.and.eventually.have.property(
							'code',
							'BalenaInvalidParameterError',
						);
				});

				it('should not be able to start an OS update when the target os version does not exist', function () {
					const promise = balena.models.device.startOsUpdate(
						this.device.uuid,
						'2.29.1+rev1.prod',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							"2.29.1+rev1.prod is not a valid value for parameter 'targetOsVersion'",
						)
						.and.eventually.have.property(
							'code',
							'BalenaInvalidParameterError',
						);
				});

				// just to confirm that the above checks do not give false positives,
				// allow the request to reach the actions server and document the current error
				it('should not be able to start an OS update for a fake device', function () {
					const promise = balena.models.device.startOsUpdate(
						this.device.uuid,
						'2.29.2+rev1.prod',
					);
					return expect(promise).to.be.rejected.then(function (error) {
						expect(error).to.have.property('statusCode', 500);
						m.chai
							.expect(error)
							.to.have.property('message', 'Request error: [object Object]');
						return m.chai
							.expect(error.code)
							.to.not.equal('BalenaInvalidParameterError');
					});
				});
			});
		});

		describe('balena.models.device.tags', function () {
			givenAnApplication(before);

			givenADevice(before);

			const appTagTestOptions = {
				// prettier-ignore
				model:
					/** @type {import('./tags').TagModelBase<import('../../../').DeviceTag>} */ (balena .models.device.tags),
				modelNamespace: 'balena.models.device.tags',
				resourceName: 'application',
				uniquePropertyNames: ['app_name', 'slug'],
			};

			const deviceTagTestOptions = {
				// prettier-ignore
				model:
					/** @type {import('./tags').TagModelBase<import('../../../').DeviceTag>} */ (balena.models.device.tags),
				modelNamespace: 'balena.models.device.tags',
				resourceName: 'device',
				uniquePropertyNames: ['uuid'],
			};

			beforeEach(function () {
				appTagTestOptions.resourceProvider = () => this.application;
				deviceTagTestOptions.resourceProvider = () => this.device;
				// used for tag creation during the
				// device.tags.getAllByApplication() test
				appTagTestOptions.setTagResourceProvider = () => this.device;
			});

			itShouldSetGetAndRemoveTags(deviceTagTestOptions);

			describe('balena.models.device.tags.getAllByApplication()', () =>
				itShouldGetAllTagsByResource(appTagTestOptions));

			describe('balena.models.device.tags.getAllByDevice()', () =>
				itShouldGetAllTagsByResource(deviceTagTestOptions));
		});

		describe('balena.models.device.configVar', function () {
			givenAnApplicationWithADevice(before);

			const configVarModel = balena.models.device.configVar;

			['id', 'uuid'].forEach(function (deviceParam) {
				const deviceParamUpper = deviceParam.toUpperCase();

				it(`can create a variable by ${deviceParam}`, function () {
					const promise = configVarModel.set(
						this.device[deviceParam],
						`BALENA_EDITOR_${deviceParamUpper}`,
						'vim',
					);
					return expect(promise).to.not.be.rejected;
				});

				it(`...can retrieve a created variable by ${deviceParam}`, function () {
					return configVarModel
						.get(this.device[deviceParam], `BALENA_EDITOR_${deviceParamUpper}`)
						.then((result) => expect(result).to.equal('vim'));
				});

				it(`...can update and retrieve a variable by ${deviceParam}`, function () {
					return configVarModel
						.set(
							this.device[deviceParam],
							`BALENA_EDITOR_${deviceParamUpper}`,
							'emacs',
						)
						.then(() => {
							return configVarModel.get(
								this.device[deviceParam],
								`BALENA_EDITOR_${deviceParamUpper}`,
							);
						})
						.then((result) => expect(result).to.equal('emacs'));
				});

				it(`...can delete and then fail to retrieve a variable by ${deviceParam}`, function () {
					return configVarModel
						.remove(
							this.device[deviceParam],
							`BALENA_EDITOR_${deviceParamUpper}`,
						)
						.then(() => {
							return configVarModel.get(
								this.device[deviceParam],
								`BALENA_EDITOR_${deviceParamUpper}`,
							);
						})
						.then((result) => expect(result).to.equal(undefined));
				});

				it(`can create and then retrieve multiple variables by ${deviceParamUpper}`, function () {
					return Promise.all([
						configVarModel.set(
							this.device[deviceParam],
							`BALENA_A_${deviceParamUpper}`,
							'a',
						),
						configVarModel.set(
							this.device[deviceParam],
							`BALENA_B_${deviceParamUpper}`,
							'b',
						),
					])
						.then(() => {
							return configVarModel.getAllByDevice(this.device[deviceParam]);
						})
						.then(function (result) {
							m.chai
								.expect(
									_.find(result, { name: `BALENA_A_${deviceParamUpper}` }),
								)
								.to.be.an('object')
								.that.has.property('value', 'a');
							return m.chai
								.expect(
									_.find(result, { name: `BALENA_B_${deviceParamUpper}` }),
								)
								.to.be.an('object')
								.that.has.property('value', 'b');
						})
						.then(() =>
							Promise.all([
								configVarModel.remove(
									this.device[deviceParam],
									`BALENA_A_${deviceParamUpper}`,
								),
								configVarModel.remove(
									this.device[deviceParam],
									`BALENA_B_${deviceParamUpper}`,
								),
							]),
						);
				});
			});

			it('can create and then retrieve multiple variables by application', function () {
				return Promise.all([
					configVarModel.set(this.device.id, 'BALENA_A_BY_APPLICATION', 'a'),
					configVarModel.set(this.device.id, 'BALENA_B_BY_APPLICATION', 'b'),
				])
					.then(() => {
						return configVarModel.getAllByApplication(this.application.id);
					})
					.then(function (result) {
						m.chai
							.expect(_.find(result, { name: 'BALENA_A_BY_APPLICATION' }))
							.to.be.an('object')
							.that.has.property('value', 'a');
						return m.chai
							.expect(_.find(result, { name: 'BALENA_B_BY_APPLICATION' }))
							.to.be.an('object')
							.that.has.property('value', 'b');
					})
					.then(() =>
						Promise.all([
							configVarModel.remove(this.device.id, 'BALENA_A_BY_APPLICATION'),
							configVarModel.remove(this.device.id, 'BALENA_B_BY_APPLICATION'),
						]),
					);
			});
		});

		describe('balena.models.device.envVar', function () {
			givenAnApplicationWithADevice(before);

			const envVarModel = balena.models.device.envVar;

			['id', 'uuid'].forEach(function (deviceParam) {
				it(`can create a variable by ${deviceParam}`, function () {
					const promise = envVarModel.set(
						this.device[deviceParam],
						`EDITOR_BY_${deviceParam}`,
						'vim',
					);
					return expect(promise).to.not.be.rejected;
				});

				it(`...can retrieve a created variable by ${deviceParam}`, function () {
					return envVarModel
						.get(this.device[deviceParam], `EDITOR_BY_${deviceParam}`)
						.then((result) => expect(result).to.equal('vim'));
				});

				it(`...can update and retrieve a variable by ${deviceParam}`, function () {
					return envVarModel
						.set(this.device[deviceParam], `EDITOR_BY_${deviceParam}`, 'emacs')
						.then(() => {
							return envVarModel.get(
								this.device[deviceParam],
								`EDITOR_BY_${deviceParam}`,
							);
						})
						.then((result) => expect(result).to.equal('emacs'));
				});

				it(`...can delete and then fail to retrieve a variable by ${deviceParam}`, function () {
					return envVarModel
						.remove(this.device[deviceParam], `EDITOR_BY_${deviceParam}`)
						.then(() => {
							return envVarModel.get(
								this.device[deviceParam],
								`EDITOR_BY_${deviceParam}`,
							);
						})
						.then((result) => expect(result).to.equal(undefined));
				});

				it(`can create and then retrieve multiple variables by ${deviceParam}`, function () {
					return Promise.all([
						envVarModel.set(
							this.device[deviceParam],
							`A_BY_${deviceParam}`,
							'a',
						),
						envVarModel.set(
							this.device[deviceParam],
							`B_BY_${deviceParam}`,
							'b',
						),
					])
						.then(() => {
							return envVarModel.getAllByDevice(this.device[deviceParam]);
						})
						.then(function (result) {
							m.chai
								.expect(_.find(result, { name: `A_BY_${deviceParam}` }))
								.to.be.an('object')
								.that.has.property('value', 'a');
							return m.chai
								.expect(_.find(result, { name: `B_BY_${deviceParam}` }))
								.to.be.an('object')
								.that.has.property('value', 'b');
						})
						.then(() =>
							Promise.all([
								envVarModel.remove(
									this.device[deviceParam],
									`A_BY_${deviceParam}`,
								),
								envVarModel.remove(
									this.device[deviceParam],
									`B_BY_${deviceParam}`,
								),
							]),
						);
				});
			});

			it('can create and then retrieve multiple variables by application', function () {
				return Promise.all([
					envVarModel.set(this.device.id, 'A_BY_APPLICATION', 'a'),
					envVarModel.set(this.device.id, 'B_BY_APPLICATION', 'b'),
				])
					.then(() => {
						return envVarModel.getAllByApplication(this.application.id);
					})
					.then(function (result) {
						m.chai
							.expect(_.find(result, { name: 'A_BY_APPLICATION' }))
							.to.be.an('object')
							.that.has.property('value', 'a');
						return m.chai
							.expect(_.find(result, { name: 'B_BY_APPLICATION' }))
							.to.be.an('object')
							.that.has.property('value', 'b');
					})
					.then(() =>
						Promise.all([
							envVarModel.remove(this.device.id, 'A_BY_APPLICATION'),
							envVarModel.remove(this.device.id, 'B_BY_APPLICATION'),
						]),
					);
			});
		});

		describe('balena.models.device.getSupervisorTargetState()', function () {
			givenAnApplicationWithADevice(before);

			it('should be rejected if the device does not exist', function () {
				const promise = balena.models.device.getSupervisorTargetState(
					'asdfghjkl',
				);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it("should reflect the device's target state", function () {
				return balena.models.device
					.getSupervisorTargetState(this.device.id)
					.then((state) => {
						// first, check the name
						expect(state.local.name).to.be.a('string');
						expect(state.local.name).to.equal(this.device.device_name);

						// next, check application types and some values
						expect(state.local.apps).to.be.an('object');
						m.chai
							.expect(state.local.apps[this.application.id].name)
							.to.equal(this.application.app_name);
						m.chai
							.expect(state.local.apps[this.application.id].name)
							.to.be.a('string');
						m.chai
							.expect(state.local.apps[this.application.id].services)
							.to.be.an('object');
						m.chai
							.expect(state.local.apps[this.application.id].volumes)
							.to.be.an('object');
						m.chai
							.expect(state.local.apps[this.application.id].networks)
							.to.be.an('object');

						// finally, check configuration type and values
						expect(state.local.config).to.be.an('object');
						m.chai
							.expect(state.local.config['RESIN_SUPERVISOR_NATIVE_LOGGER'])
							.to.equal('true');
						return m.chai
							.expect(state.local.config['RESIN_SUPERVISOR_POLL_INTERVAL'])
							.to.equal('900000');
					});
			});
		});

		describe('balena.models.device.getSupervisorState()', function () {
			givenAnApplicationWithADevice(before);

			it('should be rejected if the device does not exist', function () {
				const promise = balena.models.device.getSupervisorState('asdfghjkl');
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('Device not found: asdfghjkl');
			});

			it('should be rejected if the device exists but is inaccessible', function () {
				const promise = balena.models.device.getSupervisorState(this.device.id);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith('No online device(s) found');
			});
		});

		describe('balena.models.device.getStatus()', function () {
			givenAnApplicationWithADevice(before);

			// This tests that we give a sensible error for users of older SDK versions
			// that haven't migrated their code.
			it('should throw when passing an object as a parameter', function () {
				return balena.models.device.get(this.device.id).then((device) =>
					m.chai
						.expect(() =>
							// @ts-expect-error
							balena.models.device.getStatus(device),
						)
						.to.throw(
							"[object Object] is not a valid value for parameter 'uuidOrId'",
						),
				);
			});

			describe('Given an inactive device', () =>
				['id', 'uuid'].forEach((prop) =>
					it(`should return inactive when retrieving by ${prop}`, function () {
						const promise = balena.models.device.getStatus(this.device[prop]);
						return expect(promise).to.eventually.equal('inactive');
					}),
				));

			describe('Given an online device', function () {
				before(function () {
					return balena.pine.patch({
						resource: 'device',
						id: this.device.id,
						body: {
							// this also activates the device
							is_online: true,
						},
					});
				});

				['id', 'uuid'].forEach((prop) =>
					it(`should return idle when retrieving by ${prop}`, function () {
						const promise = balena.models.device.getStatus(this.device[prop]);
						return expect(promise).to.eventually.equal('idle');
					}),
				);
			});

			describe('Given an offline device', function () {
				before(function () {
					return balena.pine.patch({
						resource: 'device',
						id: this.device.id,
						body: {
							is_online: false,
						},
					});
				});

				['id', 'uuid'].forEach((prop) =>
					it(`should return offline when retrieving by ${prop}`, function () {
						const promise = balena.models.device.getStatus(this.device[prop]);
						return expect(promise).to.eventually.equal('offline');
					}),
				);
			});
		});
	});

	describe('given a single application with a single online device', function () {
		givenAnApplicationWithADevice(before);

		before(function () {
			return balena.pine.patch({
				resource: 'device',
				id: this.device.id,
				body: {
					is_online: true,
					os_variant: 'prod',
					os_version: 'Resin OS 2.7.8+rev1',
				},
			});
		});

		describe('balena.models.device.get()', () =>
			it('should be able to retrieve computed terms', function () {
				return balena.models.device
					.get(this.device.uuid, {
						$select: ['overall_status', 'overall_progress'],
					})
					.then((device) =>
						expect(device).to.deep.match({
							overall_status: 'idle',
							overall_progress: null,
						}),
					);
			}));
	});

	describe('given a multicontainer application', function () {
		givenMulticontainerApplication(before);

		describe('given a single offline device', function () {
			givenADevice(before);

			describe('balena.models.device.getWithServiceDetails()', function () {
				it('should be rejected if the device name does not exist', function () {
					const promise = balena.models.device.getWithServiceDetails(
						'asdfghjkl',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: asdfghjkl');
				});

				it('should be rejected if the device id does not exist', function () {
					const promise = balena.models.device.getWithServiceDetails(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Device not found: 999999');
				});

				it('should be able to use a shorter uuid', function () {
					return balena.models.device
						.getWithServiceDetails(this.device.uuid.slice(0, 8))
						.then((device) => {
							return expect(device.id).to.equal(this.device.id);
						});
				});

				it('should be able to get the device by uuid', function () {
					return balena.models.device
						.getWithServiceDetails(this.device.uuid)
						.then((device) => {
							return expect(device.id).to.equal(this.device.id);
						});
				});

				it('should be able to get the device by id', function () {
					return balena.models.device
						.getWithServiceDetails(this.device.id)
						.then((device) => {
							return expect(device.id).to.equal(this.device.id);
						});
				});

				it('should retrieve the current service details', function () {
					return balena.models.device
						.getWithServiceDetails(this.device.id)
						.then((deviceDetails) => {
							expect(deviceDetails).to.deep.match({
								device_name: this.device.device_name,
								uuid: this.device.uuid,
								is_running__release: {
									__id: this.currentRelease.id,
								},
								current_services: {
									web: [
										{
											id: this.newWebInstall.id,
											service_id: this.webService.id,
											image_id: this.newWebImage.id,
											commit: 'new-release-commit',
											status: 'Downloading',
											download_progress: 50,
										},
										{
											id: this.oldWebInstall.id,
											service_id: this.webService.id,
											image_id: this.oldWebImage.id,
											commit: 'old-release-commit',
											status: 'Running',
											download_progress: null,
										},
									],
									db: [
										{
											id: this.newDbInstall.id,
											service_id: this.dbService.id,
											image_id: this.newDbImage.id,
											commit: 'new-release-commit',
											status: 'Running',
											download_progress: null,
										},
									],
								},
							});

							// Should filter out deleted image installs
							m.chai
								.expect(deviceDetails.current_services.db)
								.to.have.lengthOf(1);

							// Should have an empty list of gateway downloads
							return m.chai
								.expect(deviceDetails.current_gateway_downloads)
								.to.have.lengthOf(0);
						});
				});

				it('should allow options to change the device fields returned', function () {
					return balena.models.device
						.getWithServiceDetails(this.device.id, {
							$select: ['id', 'uuid'],
							$expand: {
								belongs_to__application: {
									$select: ['id', 'app_name'],
								},
							},
						})
						.then((deviceDetails) => {
							expect(deviceDetails.device_name).to.be.undefined;

							expect(deviceDetails.current_services).not.to.be.undefined;

							return m.chai
								.expect(deviceDetails.belongs_to__application[0])
								.to.deep.match({
									id: this.application.id,
									app_name: this.application.app_name,
								});
						});
				});

				it('should return gateway downloads, if available', function () {
					return Promise.all([
						balena.pine.post({
							resource: 'gateway_download',
							body: {
								image: this.newWebImage.id,
								status: 'Downloading',
								is_downloaded_by__device: this.device.id,
								download_progress: 50,
							},
						}),
						balena.pine.post({
							resource: 'gateway_download',
							body: {
								image: this.oldWebImage.id,
								status: 'deleted',
								is_downloaded_by__device: this.device.id,
								download_progress: 100,
							},
						}),
					])
						.then(() => {
							return balena.models.device.getWithServiceDetails(this.device.id);
						})
						.then((deviceDetails) => {
							m.chai
								.expect(deviceDetails.current_gateway_downloads)
								.to.have.lengthOf(1);
							return m.chai
								.expect(deviceDetails.current_gateway_downloads[0])
								.to.deep.match({
									service_id: this.webService.id,
									image_id: this.newWebImage.id,
									status: 'Downloading',
									download_progress: 50,
								});
						});
				});
			});

			describe('balena.models.device.serviceVar', function () {
				const varModel = balena.models.device.serviceVar;

				['id', 'uuid'].forEach(function (deviceParam) {
					it(`can create a variable by ${deviceParam}`, function () {
						const promise = varModel.set(
							this.device[deviceParam],
							this.webService.id,
							`EDITOR_BY_${deviceParam}`,
							'vim',
						);
						return expect(promise).to.not.be.rejected;
					});

					it(`...can retrieve a created variable by ${deviceParam}`, function () {
						return varModel
							.get(
								this.device[deviceParam],
								this.webService.id,
								`EDITOR_BY_${deviceParam}`,
							)
							.then((result) => expect(result).to.equal('vim'));
					});

					it(`...can update and retrieve a variable by ${deviceParam}`, function () {
						return varModel
							.set(
								this.device[deviceParam],
								this.webService.id,
								`EDITOR_BY_${deviceParam}`,
								'emacs',
							)
							.then(() => {
								return varModel.get(
									this.device[deviceParam],
									this.webService.id,
									`EDITOR_BY_${deviceParam}`,
								);
							})
							.then((result) => expect(result).to.equal('emacs'));
					});

					it(`...can delete and then fail to retrieve a variable by ${deviceParam}`, function () {
						return varModel
							.remove(
								this.device[deviceParam],
								this.webService.id,
								`EDITOR_BY_${deviceParam}`,
							)
							.then(() => {
								return varModel.get(
									this.device[deviceParam],
									this.webService.id,
									`EDITOR_BY_${deviceParam}`,
								);
							})
							.then((result) => expect(result).to.equal(undefined));
					});

					it(`can create and then retrieve multiple variables by ${deviceParam}`, function () {
						return Promise.all([
							varModel.set(
								this.device[deviceParam],
								this.webService.id,
								`A_BY_${deviceParam}`,
								'a',
							),
							varModel.set(
								this.device[deviceParam],
								this.dbService.id,
								`B_BY_${deviceParam}`,
								'b',
							),
						])
							.then(() => {
								return varModel.getAllByDevice(this.device[deviceParam]);
							})
							.then(function (result) {
								m.chai
									.expect(_.find(result, { name: `A_BY_${deviceParam}` }))
									.to.be.an('object')
									.that.has.property('value', 'a');
								return m.chai
									.expect(_.find(result, { name: `B_BY_${deviceParam}` }))
									.to.be.an('object')
									.that.has.property('value', 'b');
							})
							.then(() =>
								Promise.all([
									varModel.remove(
										this.device[deviceParam],
										this.webService.id,
										`A_BY_${deviceParam}`,
									),
									varModel.remove(
										this.device[deviceParam],
										this.dbService.id,
										`B_BY_${deviceParam}`,
									),
								]),
							);
					});
				});

				it('can create and then retrieve multiple variables by application', function () {
					return Promise.all([
						varModel.set(
							this.device.id,
							this.webService.id,
							'A_BY_APPLICATION',
							'a',
						),
						varModel.set(
							this.device.id,
							this.dbService.id,
							'B_BY_APPLICATION',
							'b',
						),
					])
						.then(() => {
							return varModel.getAllByApplication(this.application.id);
						})
						.then(function (result) {
							m.chai
								.expect(_.find(result, { name: 'A_BY_APPLICATION' }))
								.to.be.an('object')
								.that.has.property('value', 'a');
							return m.chai
								.expect(_.find(result, { name: 'B_BY_APPLICATION' }))
								.to.be.an('object')
								.that.has.property('value', 'b');
						})
						.then(() =>
							Promise.all([
								varModel.remove(
									this.device.id,
									this.webService.id,
									'A_BY_APPLICATION',
								),
								varModel.remove(
									this.device.id,
									this.dbService.id,
									'B_BY_APPLICATION',
								),
							]),
						);
				});
			});

			describe('balena.models.device.isTrackingApplicationRelease()', function () {
				it('should be tracking the latest release, using the device id', function () {
					const promise = balena.models.device.isTrackingApplicationRelease(
						this.device.id,
					);
					return expect(promise).to.eventually.be.true;
				});

				it('should be tracking the latest release, using the device uuid', function () {
					const promise = balena.models.device.isTrackingApplicationRelease(
						this.device.uuid,
					);
					return expect(promise).to.eventually.be.true;
				});
			});

			describe('balena.models.device.getTargetReleaseHash()', function () {
				it('should retrieve the commit hash of the tracked application release, using the device id', function () {
					const promise = balena.models.device.getTargetReleaseHash(
						this.device.id,
					);
					return m.chai
						.expect(promise)
						.to.eventually.equal('new-release-commit');
				});

				it('should retrieve the commit hash of the tracked application release, using the device uuid', function () {
					const promise = balena.models.device.getTargetReleaseHash(
						this.device.uuid,
					);
					return m.chai
						.expect(promise)
						.to.eventually.equal('new-release-commit');
				});
			});
		});

		describe('given a single online device on the downloading state', function () {
			givenADevice(before, {
				is_online: true,
				os_variant: 'prod',
				os_version: 'Resin OS 2.7.8+rev1',
				supervisor_version: '6.4.2',
				last_connectivity_event: '2019-05-13T16:14',
			});

			describe('balena.models.device.getStatus()', () =>
				it('should properly retrieve the status', function () {
					const promise = balena.models.device.getStatus(this.device.uuid);
					return expect(promise).to.eventually.equal('updating');
				}));

			describe('balena.models.device.getProgress()', () =>
				it('should properly retrieve the progress', function () {
					return balena.models.device
						.getProgress(this.device.uuid)
						.then(function (result) {
							expect(result).to.be.a('number');
							return expect(result).to.equal(75);
						});
				}));
		});

		describe('given a newly registered offline device', function () {
			givenADevice(beforeEach);

			describe('balena.models.device.pinToRelease()', function () {
				it('should set the device to a specific release, using the device id & release commit', function () {
					return balena.models.device
						.pinToRelease(this.device.id, 'old-release-commit')
						.then(() => {
							const promise = balena.models.device.getTargetReleaseHash(
								this.device.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('old-release-commit');
						})
						.then(() => {
							const promise = balena.models.device.isTrackingApplicationRelease(
								this.device.id,
							);
							return expect(promise).to.eventually.be.false;
						});
				});

				it('should set the device to a specific release, using the device id & release id', function () {
					return balena.models.device
						.pinToRelease(this.device.id, this.oldRelease.id)
						.then(() => {
							const promise = balena.models.device.getTargetReleaseHash(
								this.device.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('old-release-commit');
						})
						.then(() => {
							const promise = balena.models.device.isTrackingApplicationRelease(
								this.device.id,
							);
							return expect(promise).to.eventually.be.false;
						});
				});

				it('should set the device to a specific release, using the device uuid & release commit', function () {
					return balena.models.device
						.pinToRelease(this.device.uuid, 'old-release-commit')
						.then(() => {
							const promise = balena.models.device.getTargetReleaseHash(
								this.device.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('old-release-commit');
						})
						.then(() => {
							const promise = balena.models.device.isTrackingApplicationRelease(
								this.device.id,
							);
							return expect(promise).to.eventually.be.false;
						});
				});

				it('should set the device to a specific release, using the device uuid & release id', function () {
					return balena.models.device
						.pinToRelease(this.device.uuid, this.oldRelease.id)
						.then(() => {
							const promise = balena.models.device.getTargetReleaseHash(
								this.device.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('old-release-commit');
						})
						.then(() => {
							const promise = balena.models.device.isTrackingApplicationRelease(
								this.device.id,
							);
							return expect(promise).to.eventually.be.false;
						});
				});
			});

			describe('balena.models.device.trackApplicationRelease()', function () {
				it('should set the device to track the current application release, using the device id', function () {
					return balena.models.device
						.pinToRelease(this.device.id, 'old-release-commit')
						.then(() => {
							return balena.models.device.trackApplicationRelease(
								this.device.id,
							);
						})
						.then(() => {
							const promise = balena.models.device.isTrackingApplicationRelease(
								this.device.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				});

				it('should set the device to track the current application release, using the device uuid', function () {
					return balena.models.device
						.pinToRelease(this.device.id, 'old-release-commit')
						.then(() => {
							return balena.models.device.trackApplicationRelease(
								this.device.uuid,
							);
						})
						.then(() => {
							const promise = balena.models.device.isTrackingApplicationRelease(
								this.device.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				});
			});
		});
	});

	describe('given a multicontainer application with weird service names', function () {
		givenMulticontainerApplication(before);

		before(function () {
			return Promise.all([
				balena.pine.patch({
					resource: 'service',
					id: this.webService.id,
					body: {
						service_name: 'hasOwnProperty',
					},
				}),
				balena.pine.patch({
					resource: 'service',
					id: this.dbService.id,
					body: {
						service_name: '__proto__',
					},
				}),
			]);
		});

		describe('given a single offline device', function () {
			givenADevice(before);

			describe('balena.models.device.getWithServiceDetails()', () =>
				it('should retrieve the current service details', function () {
					return balena.models.device
						.getWithServiceDetails(this.device.id)
						.then((deviceDetails) => {
							expect(deviceDetails).to.deep.match({
								device_name: this.device.device_name,
								uuid: this.device.uuid,
								is_running__release: {
									__id: this.currentRelease.id,
								},
							});

							m.chai
								.expect(Object.keys(deviceDetails.current_services).sort())
								.to.deep.equal(['__proto__', 'hasOwnProperty']);

							// it seems that deep.match doesn't work with objects with a custom __proto__ property
							m.chai
								.expect(deviceDetails.current_services.hasOwnProperty)
								.to.deep.match([
									{
										id: this.newWebInstall.id,
										service_id: this.webService.id,
										image_id: this.newWebImage.id,
										commit: 'new-release-commit',
										status: 'Downloading',
										download_progress: 50,
									},
									{
										id: this.oldWebInstall.id,
										service_id: this.webService.id,
										image_id: this.oldWebImage.id,
										commit: 'old-release-commit',
										status: 'Running',
										download_progress: null,
									},
								]);

							return m.chai
								.expect(deviceDetails.current_services.__proto__)
								.to.deep.match([
									{
										id: this.newDbInstall.id,
										service_id: this.dbService.id,
										image_id: this.newDbImage.id,
										commit: 'new-release-commit',
										status: 'Running',
										download_progress: null,
									},
								]);
						});
				}));
		});
	});

	describe('given a single application with a device id whose shorter uuid is only numbers', function () {
		givenAnApplication(before);

		before(function () {
			// Preceeding 1 is so that this can't start with a 0, so we get reversible parsing later
			this.shortUuid = '1' + Date.now().toString().slice(-6);
			const uuid =
				this.shortUuid + balena.models.device.generateUniqueKey().slice(7);
			return balena.models.device
				.register(this.application.app_name, uuid)
				.then((deviceInfo) => {
					return (this.deviceInfo = deviceInfo);
				});
		});

		describe('balena.models.device.get()', function () {
			it('should return the device given the shorter uuid as a string', function () {
				return balena.models.device.get(this.shortUuid).then((device) => {
					return expect(device.id).to.equal(this.deviceInfo.id);
				});
			});

			it('should fail to find the device given the shorter uuid as a number', function () {
				const promise = balena.models.device.get(parseInt(this.shortUuid, 10));
				return m.chai
					.expect(promise)
					.to.be.rejectedWith(`Device not found: ${this.shortUuid}`);
			});
		});
	});

	describe('given a single application with two offline devices that share the same uuid root', function () {
		givenAnApplication(before);

		before(function () {
			this.uuidRoot = 'aaaaaaaaaaaaaaaa';
			const uuid1 =
				this.uuidRoot + balena.models.device.generateUniqueKey().slice(16);
			const uuid2 =
				this.uuidRoot + balena.models.device.generateUniqueKey().slice(16);

			return Promise.all([
				balena.models.device.register(this.application.app_name, uuid1),
				balena.models.device.register(this.application.app_name, uuid2),
			]);
		});

		describe('balena.models.device.get()', () =>
			it('should be rejected with an error if there is an ambiguation between shorter uuids', function () {
				const promise = balena.models.device.get(this.uuidRoot);

				return m.chai
					.expect(promise)
					.to.be.rejected.and.eventually.have.property(
						'code',
						'BalenaAmbiguousDevice',
					);
			}));

		describe('balena.models.device.has()', () =>
			it('should be rejected with an error for an ambiguous shorter uuid', function () {
				const promise = balena.models.device.has(this.uuidRoot);

				return m.chai
					.expect(promise)
					.to.be.rejected.and.eventually.have.property(
						'code',
						'BalenaAmbiguousDevice',
					);
			}));
	});

	describe('given three compatible applications and a single device', function () {
		givenInitialOrganization(before);

		beforeEach(async function () {
			const [application1, application2, application3] = await Promise.all([
				(async () => {
					const app = await balena.models.application.create({
						name: 'FooBar',
						applicationType: 'microservices-starter',
						deviceType: 'raspberrypi3',
						organization: this.initialOrg.id,
					});

					const uuid = balena.models.device.generateUniqueKey();
					this.deviceInfo = await balena.models.device.register(
						app.app_name,
						uuid,
					);

					return app;
				})(),
				balena.models.application.create({
					name: 'BarBaz',
					applicationType: 'microservices-starter',
					deviceType: 'raspberrypi3',
					organization: this.initialOrg.id,
				}),
				balena.models.application.create({
					name: 'BazFoo',
					applicationType: 'microservices-starter',
					deviceType: 'raspberry-pi2',
					organization: this.initialOrg.id,
				}),
			]);
			this.application1 = application1;
			this.application2 = application2;
			this.application3 = application3;
		});

		afterEach(function () {
			return balena.pine.delete({
				resource: 'application',
				options: {
					$filter: {
						id: {
							$in: [
								this.application1.id,
								this.application2.id,
								this.application3.id,
							],
						},
					},
				},
			});
		});

		describe('balena.models.device.move()', function () {
			['id', 'app_name', 'slug'].forEach((prop) =>
				it(`should be able to move a device by device uuid and application ${prop}`, function () {
					return balena.models.device
						.move(this.deviceInfo.uuid, this.application2[prop])
						.then(() => {
							return balena.models.device.getApplicationName(
								this.deviceInfo.uuid,
							);
						})
						.then((applicationName) => {
							return m.chai
								.expect(applicationName)
								.to.equal(this.application2.app_name);
						});
				}),
			);

			it('should be able to move a device using shorter uuids', function () {
				return balena.models.device
					.move(this.deviceInfo.uuid.slice(0, 7), this.application2.id)
					.then(() => {
						return balena.models.device.getApplicationName(this.deviceInfo.id);
					})
					.then((applicationName) => {
						return m.chai
							.expect(applicationName)
							.to.equal(this.application2.app_name);
					});
			});

			it('should be able to move a device to an application of the same architecture', function () {
				return balena.models.device
					.move(this.deviceInfo.id, this.application3.id)
					.then(() => {
						return balena.models.device.getApplicationName(this.deviceInfo.id);
					})
					.then((applicationName) => {
						return m.chai
							.expect(applicationName)
							.to.equal(this.application3.app_name);
					});
			});
		});
	});

	describe('given two incompatible applications and a single device', function () {
		givenInitialOrganization(before);

		beforeEach(async function () {
			const [application1, application2] = await Promise.all([
				(async () => {
					const app = await balena.models.application.create({
						name: 'FooBar',
						applicationType: 'microservices-starter',
						deviceType: 'raspberry-pi',
						organization: this.initialOrg.id,
					});

					const uuid = balena.models.device.generateUniqueKey();
					this.deviceInfo = await balena.models.device.register(
						app.app_name,
						uuid,
					);

					return app;
				})(),
				balena.models.application.create({
					name: 'BarBaz',
					applicationType: 'microservices-starter',
					deviceType: 'intel-nuc',
					organization: this.initialOrg.id,
				}),
			]);
			this.application1 = application1;
			this.application2 = application2;
		});

		afterEach(function () {
			return balena.pine.delete({
				resource: 'application',
				options: {
					$filter: {
						id: {
							$in: [this.application1.id, this.application2.id],
						},
					},
				},
			});
		});

		describe('balena.models.device.move()', () =>
			it('should be rejected with an incompatibility error', function () {
				const promise = balena.models.device.move(
					this.deviceInfo.uuid,
					this.application2.app_name,
				);
				return m.chai
					.expect(promise)
					.to.be.rejectedWith(
						`Incompatible application: ${this.application2.app_name}`,
					);
			}));
	});

	describe('given applications of different architectures with a device on each', function () {
		givenInitialOrganization(before);

		before(async function () {
			const apps = await Promise.all([
				balena.models.application.create({
					name: 'FooBarArmv6',
					applicationType: 'microservices-starter',
					deviceType: 'raspberry-pi',
					organization: this.initialOrg.id,
				}),
				balena.models.application.create({
					name: 'FooBar32',
					applicationType: 'microservices-starter',
					deviceType: 'raspberrypi3',
					organization: this.initialOrg.id,
				}),
				balena.models.application.create({
					name: 'BarBaz64',
					applicationType: 'microservices-starter',
					deviceType: 'raspberrypi3-64',
					organization: this.initialOrg.id,
				}),
			]);
			this.apps = {
				rpi: apps[0],
				armv7hf: apps[1],
				aarch64: apps[2],
			};

			const devices = await Promise.all(
				apps.map((app) =>
					balena.models.device.register(
						app.id,
						balena.models.device.generateUniqueKey(),
					),
				),
			);
			this.devices = {
				rpi: devices[0],
				armv7hf: devices[1],
				aarch64: devices[2],
			};
		});

		after(function () {
			return balena.pine.delete({
				resource: 'application',
				options: {
					$filter: {
						id: {
							$in: _.map(this.apps, 'id'),
						},
					},
				},
			});
		});

		describe('balena.models.device.move()', function () {
			[
				['rpi', 'armv7hf'],
				['rpi', 'aarch64'],
				['armv7hf', 'aarch64'],
			].forEach(function ([deviceArch, appArch]) {
				it(`should be rejected with an incompatibility error when trying to move an ${deviceArch} device to an ${appArch} application`, function () {
					const device = this.devices[deviceArch];
					const app = this.apps[appArch];
					const promise = balena.models.device.move(device.uuid, app.app_name);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(`Incompatible application: ${app.app_name}`);
				});
			});

			return [
				['aarch64', 'armv7hf'],
				['aarch64', 'rpi'],
				['armv7hf', 'rpi'],
			].forEach(function ([deviceArch, appArch]) {
				it(`should be able to move an ${deviceArch} device to an ${appArch} application`, function () {
					const device = this.devices[deviceArch];
					const app = this.apps[appArch];
					return balena.models.device
						.move(device.id, app.id)
						.then(() => balena.models.device.getApplicationName(device.id))
						.then((applicationName) =>
							expect(applicationName).to.equal(app.app_name),
						);
				});
			});
		});
	});

	describe('helpers', function () {
		describe('balena.models.device.getDashboardUrl()', function () {
			it('should return the respective DashboardUrl when a device uuid is provided', function () {
				// prettier-ignore
				const dashboardUrl = (/** @type {string} */ (sdkOpts.apiUrl))
					.replace(/api/, 'dashboard');
				return m.chai
					.expect(
						balena.models.device.getDashboardUrl(
							'af1150f1b1734c428fb1606a4cddec6c',
						),
					)
					.to.equal(
						`${dashboardUrl}/devices/af1150f1b1734c428fb1606a4cddec6c/summary`,
					);
			});

			it('should throw when a device uuid is not a string', () =>
				m.chai
					.expect(() =>
						// @ts-expect-error
						balena.models.device.getDashboardUrl(1234567),
					)
					.to.throw());

			it('should throw when a device uuid is not provided', () =>
				// @ts-expect-error
				expect(() => balena.models.device.getDashboardUrl()).to.throw());
		});

		describe('balena.models.device.lastOnline()', function () {
			it('should return the string "Connecting..." if the device has no `last_connectivity_event`', () =>
				m.chai
					.expect(
						balena.models.device.lastOnline({
							last_connectivity_event: null,
							is_online: false,
						}),
					)
					.to.equal('Connecting...'));

			it('should return the correct time string if the device is online', function () {
				const mockDevice = {
					last_connectivity_event: new Date(
						Date.now() - 1000 * 60 * 5,
					).toUTCString(),
					is_online: true,
				};

				return m.chai
					.expect(balena.models.device.lastOnline(mockDevice))
					.to.equal('Online (for 5 minutes)');
			});

			it('should return the correct time string if the device is offline', function () {
				const mockDevice = {
					last_connectivity_event: new Date(
						Date.now() - 1000 * 60 * 5,
					).toUTCString(),
					is_online: false,
				};

				return m.chai
					.expect(balena.models.device.lastOnline(mockDevice))
					.to.equal('5 minutes ago');
			});
		});

		describe('balena.models.device.getLocalModeSupport()', function () {
			it('should identify a device w/o a supervisor_version as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'dev',
							os_version: 'Resin OS 2.7.8+rev1',
							supervisor_version: '',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Device is not yet fully provisioned',
					}));

			it('should identify a device w/o a last_connectivity_event as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'dev',
							os_version: 'Resin OS 2.7.8+rev1',
							supervisor_version: '6.4.2',
							last_connectivity_event: null,
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Device is not yet fully provisioned',
					}));

			it('should identify a device w/o an os_version as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'dev',
							os_version: null,
							supervisor_version: '6.4.2',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Device OS version does not support local mode',
					}));

			it('should identify a device with an invalid os_version as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'dev',
							os_version: 'ResinOS 2.7.8.9+rev1',
							supervisor_version: '6.4.2',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Device OS version does not support local mode',
					}));

			it('should identify a device with a v1 OS as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: '',
							os_version: 'Resin OS 1.26.0',
							supervisor_version: '6.4.2',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Device OS version does not support local mode',
					}));

			it('should identify a device with an old supervisor as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'dev',
							os_version: 'Resin OS 2.0.0+rev1',
							supervisor_version: '3.99.99',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Device supervisor version does not support local mode',
					}));

			it('should identify a device w/o an os_variant as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: '',
							os_version: 'Resin OS 2.7.8+rev1',
							supervisor_version: '6.4.2',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Local mode is only supported on development OS versions',
					}));

			it('should identify a device with a production image as not supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'prod',
							os_version: 'Resin OS 2.7.8+rev1',
							supervisor_version: '6.4.2',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: false,
						message: 'Local mode is only supported on development OS versions',
					}));

			it('should identify a device with a development image as supported', () =>
				m.chai
					.expect(
						balena.models.device.getLocalModeSupport({
							is_online: true,
							os_variant: 'dev',
							os_version: 'Resin OS 2.7.8+rev1',
							supervisor_version: '6.4.2',
							last_connectivity_event: '2019-05-13T16:14',
						}),
					)
					.to.deep.equal({
						supported: true,
						message: 'Supported',
					}));
		});

		describe('balena.models.device.getOsVersion()', function () {
			it('should not parse invalid semver versions', () =>
				_.forEach(
					[
						['Resin OS ', 'dev'],
						['Resin OS ', 'prod'],
						['Resin OS 2.0-beta.8', ''],
					],
					function ([osVersion, osVariant]) {
						return m.chai
							.expect(
								balena.models.device.getOsVersion({
									os_version: osVersion,
									os_variant: osVariant,
								}),
							)
							.to.equal(null);
					},
				));

			it('should parse plain os versions w/o variant', () =>
				_.forEach(
					[
						['Resin OS 1.2.1', '', '1.2.1'],
						['Resin OS 1.6.0', '', '1.6.0'],
						['Resin OS 2.0.0-beta.1', '', '2.0.0-beta.1'],
						['Resin OS 2.0.0-beta.3', '', '2.0.0-beta.3'],
						['Resin OS 2.0.0-beta11.rev1', '', '2.0.0-beta11.rev1'],
						['Resin OS 2.0.0-beta.8', '', '2.0.0-beta.8'],
						['Resin OS 2.0.0-rc1.rev1', '', '2.0.0-rc1.rev1'],
						['Resin OS 2.0.0-rc1.rev2', '', '2.0.0-rc1.rev2'],
						['Resin OS 2.0.1-beta.4', '', '2.0.1-beta.4'],
						['Resin OS 2.0.1.rev1', '', '2.0.1+rev1'],
						['Resin OS 2.0.2-beta.2', '', '2.0.2-beta.2'],
						['Resin OS 2.0.2-beta.7', '', '2.0.2-beta.7'],
						['Resin OS 2.0.2+rev2', '', '2.0.2+rev2'],
						['Resin OS 2.0.6+rev2', '', '2.0.6+rev2'],
					],
					function ([osVersion, osVariant, expectation]) {
						return m.chai
							.expect(
								balena.models.device.getOsVersion({
									os_version: osVersion,
									os_variant: osVariant,
								}),
							)
							.to.equal(expectation);
					},
				));

			it('should properly combine the plain os version & variant', () =>
				_.forEach(
					[
						['Resin OS 2.0.0-beta.8', 'prod', '2.0.0-beta.8+prod'],
						['balenaOS 2.0.0-beta12.rev1', 'prod', '2.0.0-beta12.rev1+prod'],
						['Resin OS 2.0.0-rc1.rev2', 'prod', '2.0.0-rc1.rev2+prod'],
						['Resin OS 2.0.0+rev2', 'prod', '2.0.0+rev2.prod'],
						['Resin OS 2.0.0+rev3', 'prod', '2.0.0+rev3.prod'],
						['Resin OS 2.0.2+rev2', 'dev', '2.0.2+rev2.dev'],
						['Resin OS 2.0.3+rev1', 'dev', '2.0.3+rev1.dev'],
						['Resin OS 2.0.3+rev1', 'prod', '2.0.3+rev1.prod'],
						['Resin OS 2.0.4+rev1', 'dev', '2.0.4+rev1.dev'],
						['Resin OS 2.0.4+rev1', 'prod', '2.0.4+rev1.prod'],
						['Resin OS 2.0.4+rev2', 'prod', '2.0.4+rev2.prod'],
						['Resin OS 2.0.5', 'dev', '2.0.5+dev'],
						['Resin OS 2.0.5+rev1', 'dev', '2.0.5+rev1.dev'],
						['Resin OS 2.0.5+rev1', 'prod', '2.0.5+rev1.prod'],
						['Resin OS 2.0.6+rev1', 'dev', '2.0.6+rev1.dev'],
						['Resin OS 2.0.6+rev1', 'prod', '2.0.6+rev1.prod'],
						['Resin OS 2.0.6+rev2', 'dev', '2.0.6+rev2.dev'],
						['Resin OS 2.0.6+rev2', 'prod', '2.0.6+rev2.prod'],
						['Resin OS 2.1.0+rev1', 'dev', '2.1.0+rev1.dev'],
						['Resin OS 2.1.0+rev1', 'prod', '2.1.0+rev1.prod'],
						['Resin OS 2.2.0+rev1', 'dev', '2.2.0+rev1.dev'],
						['Resin OS 2.2.0+rev1', 'prod', '2.2.0+rev1.prod'],
						['Resin OS 2.9.0-multi1+rev1', 'dev', '2.9.0-multi1+rev1.dev'],
						['Resin OS 2.9.7+rev1', 'dev', '2.9.7+rev1.dev'],
						['Resin OS 2.9.7+rev1', 'prod', '2.9.7+rev1.prod'],
						['Resin OS 2.12.0+rev1', 'dev', '2.12.0+rev1.dev'],
						['Resin OS 2.12.0+rev1', 'prod', '2.12.0+rev1.prod'],
						['Resin OS 2.12.1+rev1', 'dev', '2.12.1+rev1.dev'],
						['Resin OS 2.12.1+rev1', 'prod', '2.12.1+rev1.prod'],
						['Resin OS 2.12.3', 'dev', '2.12.3+dev'],
						['Resin OS 2.12.3+rev1', 'dev', '2.12.3+rev1.dev'],
						['balenaOS 2.26.0', 'dev', '2.26.0+dev'],
						['balenaOS 2.26.0+rev1', 'dev', '2.26.0+rev1.dev'],
						['balenaOS 2.26.0+rev1', 'prod', '2.26.0+rev1.prod'],
						['balenaOS 2.28.0-beta1.rev1', 'prod', '2.28.0-beta1.rev1+prod'],
						['balenaOS 2.28.0+rev1', 'dev', '2.28.0+rev1.dev'],
					],
					function ([osVersion, osVariant, expectation]) {
						return m.chai
							.expect(
								balena.models.device.getOsVersion({
									os_version: osVersion,
									os_variant: osVariant,
								}),
							)
							.to.equal(expectation);
					},
				));

			it('should properly parse the os_version with variant suffix w/o os_variant', () =>
				_.forEach(
					[
						['Resin OS 2.0.0-rc6.rev1 (prod)', '', '2.0.0-rc6.rev1+prod'],
						['Resin OS 2.0.0.rev1 (prod)', '', '2.0.0+rev1.prod'],
						['Resin OS 2.0.0+rev2 (prod)', '', '2.0.0+rev2.prod'],
						['Resin OS 2.0.0+rev3 (dev)', '', '2.0.0+rev3.dev'],
						['Resin OS 2.0.0+rev3 (prod)', '', '2.0.0+rev3.prod'],
						['Resin OS 2.0.0+rev4 (prod)', '', '2.0.0+rev4.prod'],
						['Resin OS 2.0.0+rev5 (dev)', '', '2.0.0+rev5.dev'],
					],
					function ([osVersion, osVariant, expectation]) {
						return m.chai
							.expect(
								balena.models.device.getOsVersion({
									os_version: osVersion,
									os_variant: osVariant,
								}),
							)
							.to.equal(expectation);
					},
				));

			it('should properly combine the os_version with variant suffix & os_variant', () =>
				_.forEach(
					[
						['Resin OS 2.0.0.rev1 (prod)', 'prod', '2.0.0+rev1.prod'],
						['Resin OS 2.0.0+rev2 (prod)', 'prod', '2.0.0+rev2.prod'],
						['Resin OS 2.0.0+rev3 (dev)', 'dev', '2.0.0+rev3.dev'],
						['Resin OS 2.0.0+rev3 (prod)', 'prod', '2.0.0+rev3.prod'],
						['Resin OS 2.0.0+rev4 (prod)', 'prod', '2.0.0+rev4.prod'],
						['Resin OS 2.0.0+rev5 (prod)', 'prod', '2.0.0+rev5.prod'],
					],
					function ([osVersion, osVariant, expectation]) {
						return m.chai
							.expect(
								balena.models.device.getOsVersion({
									os_version: osVersion,
									os_variant: osVariant,
								}),
							)
							.to.equal(expectation);
					},
				));
		});

		describe('balena.models.device._checkOsUpdateTarget()', function () {
			const uuid = balena.models.device.generateUniqueKey();

			// @ts-expect-error
			const { _checkOsUpdateTarget } = balena.models.device;

			it('should throw when the current os version is invalid', () =>
				[
					['Resin OS ', 'dev'],
					['Resin OS ', 'prod'],
					['Resin OS 2.0-beta.8', ''],
				].forEach(function ([osVersion, osVariant]) {
					const mockDevice = {
						uuid,
						is_of__device_type: [{ slug: 'raspberrypi3' }],
						is_online: true,
						os_version: osVersion,
						os_variant: osVariant,
					};

					return m.chai
						.expect(() => _checkOsUpdateTarget(mockDevice, '2.29.2+rev1.prod'))
						.to.throw('Invalid current balenaOS version');
				}));

			it('should throw when the device is offline', () =>
				[
					['Resin OS 1.21.0', '', '1.28.0'],
					['Resin OS 1.30.1', '', '2.5.0+rev1'],
					['balenaOS 2.26.0+rev1', 'prod', '2.29.2+rev1.prod'],
				].forEach(function ([osVersion, osVariant, targetOsVersion]) {
					const mockDevice = {
						uuid,
						is_of__device_type: [{ slug: 'raspberrypi3' }],
						is_online: false,
						os_version: osVersion,
						os_variant: osVariant,
					};

					return m.chai
						.expect(() => _checkOsUpdateTarget(mockDevice, targetOsVersion))
						.to.throw('The device is offline');
				}));

			it('should throw for upgrades from prod -> dev', () =>
				[
					['Resin OS 2.0.0+rev3 (prod)', 'prod'],
					['Resin OS 2.0.0+rev3 (prod)', ''],
					['Resin OS 2.0.4+rev1', 'prod'],
					['Resin OS 2.0.5', 'prod'],
					['Resin OS 2.12.1+rev1', 'prod'],
					['Resin OS 2.12.3', 'prod'],
					['Resin OS 2.12.3+rev1', 'prod'],
					['balenaOS 2.26.0', 'prod'],
					['balenaOS 2.28.0+rev1', 'prod'],
				].forEach(function ([osVersion, osVariant]) {
					const mockDevice = {
						uuid,
						is_of__device_type: [{ slug: 'raspberrypi3' }],
						is_online: true,
						os_version: osVersion,
						os_variant: osVariant,
					};

					return m.chai
						.expect(() => _checkOsUpdateTarget(mockDevice, '2.29.2+rev1.dev'))
						.to.throw(
							'Updates cannot be performed between development and production balenaOS variants',
						);
				}));

			it('should throw for upgrades from dev -> prod', () =>
				[
					['Resin OS 2.0.0+rev3 (dev)', 'dev'],
					['Resin OS 2.0.0+rev5 (dev)', ''],
					['Resin OS 2.0.4+rev1', 'dev'],
					['Resin OS 2.0.5', 'dev'],
					['Resin OS 2.0.5+rev1', 'dev'],
					['Resin OS 2.0.6+rev2', 'dev'],
					['Resin OS 2.9.7+rev1', 'dev'],
					['Resin OS 2.12.0+rev1', 'dev'],
					['Resin OS 2.12.1+rev1', 'dev'],
					['Resin OS 2.12.3', 'dev'],
					['balenaOS 2.26.0', 'dev'],
					['balenaOS 2.26.0+rev1', 'dev'],
					['balenaOS 2.28.0+rev1', 'dev'],
				].forEach(function ([osVersion, osVariant]) {
					const mockDevice = {
						uuid,
						is_of__device_type: [{ slug: 'raspberrypi3' }],
						is_online: true,
						os_version: osVersion,
						os_variant: osVariant,
					};

					return m.chai
						.expect(() => _checkOsUpdateTarget(mockDevice, '2.29.2+rev1.prod'))
						.to.throw(
							'Updates cannot be performed between development and production balenaOS variants',
						);
				}));

			it('should throw when the device is running a pre-release version', () =>
				[
					['Resin OS 2.0.0-beta.1', ''],
					['Resin OS 2.0.0-beta.3', ''],
					['Resin OS 2.0.0-beta11.rev1', ''],
					['Resin OS 2.0.0-beta.8', ''],
					['Resin OS 2.0.0-beta.8', 'prod'],
					['balenaOS 2.0.0-beta12.rev1', 'prod'],
					['Resin OS 2.0.0-rc1.rev1', ''],
					['Resin OS 2.0.0-rc1.rev2', 'prod'],
					['Resin OS 2.0.0-rc1.rev2', ''],
					['Resin OS 2.0.0-rc6.rev1 (prod)', ''],
					['Resin OS 2.0.1-beta.4', ''],
					['Resin OS 2.0.2-beta.2', ''],
					['Resin OS 2.0.2-beta.7', ''],
					['Resin OS 2.9.0-multi1+rev1', 'dev'],
					['balenaOS 2.28.0-beta1.rev1', 'prod'],
				].forEach(function ([osVersion, osVariant]) {
					const mockDevice = {
						uuid,
						is_of__device_type: [{ slug: 'raspberrypi3' }],
						is_online: true,
						os_version: osVersion,
						os_variant: osVariant,
					};

					return m.chai
						.expect(() => _checkOsUpdateTarget(mockDevice, '2.29.2+rev1.prod'))
						.to.throw(
							'Updates cannot be performed on pre-release balenaOS versions',
						);
				}));

			describe('v1 -> v1 hup', () =>
				['raspberrypi3', 'intel-nuc'].forEach((deviceType) =>
					describe(`given a ${deviceType}`, function () {
						it('should throw when current os version is < 1.8.0', () =>
							[
								['Resin OS 1.2.1', ''],
								['Resin OS 1.6.0', ''],
								['Resin OS 1.7.2', ''],
							].forEach(function ([osVersion, osVariant]) {
								const mockDevice = {
									uuid,
									is_of__device_type: [{ slug: deviceType }],
									is_online: true,
									os_version: osVersion,
									os_variant: osVariant,
								};

								return m.chai
									.expect(() => _checkOsUpdateTarget(mockDevice, '1.26.0'))
									.to.throw('Current OS version must be >= 1.8.0');
							}));

						it('should throw when the target os version is below the min supported v1 version', () =>
							[
								['Resin OS 1.8.0', ''],
								['Resin OS 1.10.0', ''],
								['Resin OS 1.19.0', ''],
								['Resin OS 1.21.0', ''],
							].forEach(function ([osVersion, osVariant]) {
								const mockDevice = {
									uuid,
									is_of__device_type: [{ slug: deviceType }],
									is_online: true,
									os_version: osVersion,
									os_variant: osVariant,
								};

								return m.chai
									.expect(() => _checkOsUpdateTarget(mockDevice, '1.25.0'))
									.to.throw('Target OS version must be >= 1.26.0');
							}));

						it('should not throw when it is a valid v1 -> v1 hup', () =>
							[
								['Resin OS 1.8.0', ''],
								['Resin OS 1.10.0', ''],
								['Resin OS 1.19.0', ''],
								['Resin OS 1.21.0', ''],
							].forEach(function ([osVersion, osVariant]) {
								const mockDevice = {
									uuid,
									is_of__device_type: [{ slug: deviceType }],
									is_online: true,
									os_version: osVersion,
									os_variant: osVariant,
								};

								return m.chai
									.expect(() => _checkOsUpdateTarget(mockDevice, '1.28.0'))
									.to.not.throw();
							}));
					}),
				));

			describe('v1 -> v2 hup', function () {
				describe('given a raspberrypi3', function () {
					it('should throw when current os version is < 1.8.0', () =>
						[
							['Resin OS 1.2.1', ''],
							['Resin OS 1.6.0', ''],
							['Resin OS 1.7.2', ''],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'raspberrypi3' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() => _checkOsUpdateTarget(mockDevice, '2.5.0+rev1'))
								.to.throw('Current OS version must be >= 1.8.0');
						}));

					it('should not throw when it is a valid v1 -> v2 hup', () =>
						[
							['Resin OS 1.8.0', ''],
							['Resin OS 1.10.0', ''],
							['Resin OS 1.19.0', ''],
							['Resin OS 1.21.0', ''],
							['Resin OS 1.26.1', ''],
							['Resin OS 1.30.1', ''],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'raspberrypi3' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() => _checkOsUpdateTarget(mockDevice, '2.5.0+rev1'))
								.to.not.throw();
						}));
				});

				describe('given a beaglebone-black', function () {
					it('should throw when current os version is < 1.30.1', () =>
						[
							['Resin OS 1.2.1', ''],
							['Resin OS 1.6.0', ''],
							['Resin OS 1.7.2', ''],
							['Resin OS 1.8.0', ''],
							['Resin OS 1.10.0', ''],
							['Resin OS 1.19.0', ''],
							['Resin OS 1.21.0', ''],
							['Resin OS 1.26.1', ''],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'beaglebone-black' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() => _checkOsUpdateTarget(mockDevice, '2.5.0+rev1'))
								.to.throw('Current OS version must be >= 1.30.1');
						}));

					it('should not throw when it is a valid v1 -> v2 hup', () =>
						[['Resin OS 1.30.1', '']].forEach(function ([
							osVersion,
							osVariant,
						]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'beaglebone-black' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() => _checkOsUpdateTarget(mockDevice, '2.5.0+rev1'))
								.to.not.throw();
						}));
				});
			});

			describe('v2 -> v2 hup', function () {
				describe('given a raspberrypi3', function () {
					it('should throw when current os version is < 2.0.0+rev1', () =>
						[['Resin OS 2.0.0.rev0 (prod)', 'prod']].forEach(function ([
							osVersion,
							osVariant,
						]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'raspberrypi3' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() =>
									_checkOsUpdateTarget(mockDevice, '2.1.0+rev1.prod'),
								)
								.to.throw('Current OS version must be >= 2.0.0+rev1');
						}));

					it('should not throw when it is a valid v2 -> v2 hup', () =>
						[
							['Resin OS 2.0.0.rev1 (prod)', 'prod'],
							['Resin OS 2.0.0.rev1 (prod)', ''],
							['Resin OS 2.0.0+rev2', 'prod'],
							['Resin OS 2.0.0+rev2 (prod)', 'prod'],
							['Resin OS 2.0.0+rev2 (prod)', ''],
							['Resin OS 2.0.0+rev3', 'prod'],
							['Resin OS 2.0.0+rev3 (prod)', 'prod'],
							['Resin OS 2.0.0+rev3 (prod)', ''],
							['Resin OS 2.0.0+rev4 (prod)', 'prod'],
							['Resin OS 2.0.0+rev4 (prod)', ''],
							['Resin OS 2.0.0+rev5 (prod)', 'prod'],
							['Resin OS 2.0.1.rev1', ''],
							['Resin OS 2.0.2+rev2', ''],
							['Resin OS 2.0.3+rev1', 'prod'],
							['Resin OS 2.0.4+rev1', 'prod'],
							['Resin OS 2.0.4+rev2', 'prod'],
							['Resin OS 2.0.5+rev1', 'prod'],
							['Resin OS 2.0.6+rev1', 'prod'],
							['Resin OS 2.0.6+rev2', 'prod'],
							['Resin OS 2.0.6+rev2', ''],
							['Resin OS 2.1.0+rev1', 'prod'],
							['Resin OS 2.2.0+rev1', 'prod'],
							['Resin OS 2.9.7+rev1', 'prod'],
							['Resin OS 2.12.0+rev1', 'prod'],
							['Resin OS 2.12.1+rev1', 'prod'],
							['balenaOS 2.26.0+rev1', 'prod'],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'raspberrypi3' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() =>
									_checkOsUpdateTarget(mockDevice, '2.29.2+rev1.prod'),
								)
								.to.not.throw();
						}));
				});

				describe('given a jetson-tx2', function () {
					it('should throw when current os version is < 2.7.4', () =>
						[
							['Resin OS 2.0.0.rev1 (prod)', 'prod'],
							['Resin OS 2.0.0.rev1 (prod)', ''],
							['Resin OS 2.0.0+rev2', 'prod'],
							['Resin OS 2.0.0+rev2 (prod)', 'prod'],
							['Resin OS 2.0.0+rev2 (prod)', ''],
							['Resin OS 2.0.0.rev1 (prod)', 'prod'],
							['Resin OS 2.0.0.rev1 (prod)', ''],
							['Resin OS 2.0.0+rev2', 'prod'],
							['Resin OS 2.0.0+rev2 (prod)', 'prod'],
							['Resin OS 2.0.0+rev2 (prod)', ''],
							['Resin OS 2.0.0+rev3', 'prod'],
							['Resin OS 2.0.0+rev3 (prod)', 'prod'],
							['Resin OS 2.0.0+rev3 (prod)', ''],
							['Resin OS 2.0.0+rev4 (prod)', 'prod'],
							['Resin OS 2.0.0+rev4 (prod)', ''],
							['Resin OS 2.0.0+rev5 (prod)', 'prod'],
							['Resin OS 2.0.1.rev1', ''],
							['Resin OS 2.0.2+rev2', ''],
							['Resin OS 2.0.3+rev1', 'prod'],
							['Resin OS 2.0.4+rev1', 'prod'],
							['Resin OS 2.0.4+rev2', 'prod'],
							['Resin OS 2.0.5+rev1', 'prod'],
							['Resin OS 2.0.6+rev1', 'prod'],
							['Resin OS 2.0.6+rev2', 'prod'],
							['Resin OS 2.0.6+rev2', ''],
							['Resin OS 2.1.0+rev1', 'prod'],
							['Resin OS 2.2.0+rev1', 'prod'],
							['Resin OS 2.3.0+rev1', 'prod'],
							['Resin OS 2.3.0+rev2', 'prod'],
							['Resin OS 2.4.1+rev1', 'prod'],
							['Resin OS 2.4.2+rev1', 'prod'],
							['Resin OS 2.6.0+rev1', 'prod'],
							['Resin OS 2.7.2+rev1', 'prod'],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'jetson-tx2' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() =>
									_checkOsUpdateTarget(mockDevice, '2.29.2+rev1.prod'),
								)
								.to.throw('Current OS version must be >= 2.7.4');
						}));

					it('should not throw when it is a valid v2 -> v2 prod variant hup', () =>
						[
							['Resin OS 2.7.4+rev1', 'prod'],
							['Resin OS 2.7.4+rev2', 'prod'],
							['Resin OS 2.7.5+rev1', 'prod'],
							['Resin OS 2.7.5+rev2', 'prod'],
							['Resin OS 2.7.6+rev1', 'prod'],
							['Resin OS 2.7.8+rev1', 'prod'],
							['Resin OS 2.7.8+rev2', 'prod'],
							['Resin OS 2.9.7+rev1', 'prod'],
							['Resin OS 2.12.0+rev1', 'prod'],
							['Resin OS 2.12.1+rev1', 'prod'],
							['balenaOS 2.26.0+rev1', 'prod'],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'jetson-tx2' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() =>
									_checkOsUpdateTarget(mockDevice, '2.29.2+rev1.prod'),
								)
								.to.not.throw();
						}));

					it('should not throw when it is a valid v2 -> v2 dev variant hup', () =>
						[
							['Resin OS 2.7.4+rev1.dev', 'dev'],
							['Resin OS 2.9.7+rev2.dev', 'dev'],
							['balenaOS 2.26.0+rev1.dev', 'dev'],
						].forEach(function ([osVersion, osVariant]) {
							const mockDevice = {
								uuid,
								is_of__device_type: [{ slug: 'jetson-tx2' }],
								is_online: true,
								os_version: osVersion,
								os_variant: osVariant,
							};

							return m.chai
								.expect(() =>
									_checkOsUpdateTarget(mockDevice, '2.29.2+rev1.dev'),
								)
								.to.not.throw();
						}));
				});
			});
		});
	});
});