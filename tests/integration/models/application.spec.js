import * as _ from 'lodash';
import * as m from 'mochainon';

const { expect } = m.chai;

import {
	balena,
	credentials,
	givenADevice,
	givenAnApplication,
	givenLoggedInUser,
	givenMulticontainerApplicationWithADevice,
	givenInitialOrganization,
	sdkOpts,
} from '../setup';

import {
	itShouldSetGetAndRemoveTags,
	itShouldGetAllTagsByResource,
} from './tags';

describe('Application Model', function () {
	givenLoggedInUser(before);

	describe('given no applications', function () {
		describe('balena.models.application.getAll()', function () {
			it('should eventually become an empty array [Promise]', function () {
				const promise = balena.models.application.getAll();
				return expect(promise).to.become([]);
			});

			it('should eventually become an empty array [callback]', function (done) {
				// @ts-expect-error
				balena.models.application.getAll(function (err, applications) {
					expect(err).to.be.null;
					expect(applications).to.deep.equal([]);
					return done();
				});
			});
		});

		describe('balena.models.application.getAppByOwner()', function () {
			it('should eventually reject [Promise]', function () {
				const promise = balena.models.application.getAppByOwner(
					'testapp',
					'FooBar',
				);
				return expect(promise).to.be.rejected;
			});

			it('should eventually reject [callback]', function (done) {
				// @ts-expect-error
				balena.models.application.getAppByOwner('testapp', 'FooBar', function (
					err,
				) {
					expect(err).to.not.be.undefined;
					return done();
				});
			});
		});

		describe('balena.models.application.hasAny()', () =>
			it('should eventually be false', function () {
				const promise = balena.models.application.hasAny();
				return expect(promise).to.eventually.be.false;
			}));

		describe('balena.models.application.create()', function () {
			givenInitialOrganization(before);

			describe('[read operations]', function () {
				it('should be rejected if the application type is invalid', function () {
					const promise = balena.models.application.create({
						name: 'FooBar',
						applicationType: 'non-existing',
						deviceType: 'raspberry-pi',
						organization: this.initialOrg.id,
					});
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Invalid application type: non-existing');
				});

				it('should be rejected if the device type is invalid', function () {
					const promise = balena.models.application.create({
						name: 'FooBar',
						applicationType: 'microservices-starter',
						deviceType: 'foobarbaz',
						organization: this.initialOrg.id,
					});
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Invalid device type: foobarbaz');
				});

				it('should be rejected if the device type is discontinued', function () {
					const promise = balena.models.application.create({
						name: 'FooBar',
						applicationType: 'microservices-starter',
						deviceType: 'edge',
						organization: this.initialOrg.id,
					});
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Discontinued device type: edge');
				});

				it('should be rejected if the name has less than four characters', function () {
					const promise = balena.models.application.create({
						name: 'Foo',
						applicationType: 'microservices-starter',
						deviceType: 'raspberry-pi',
						organization: this.initialOrg.id,
					});
					return expect(promise).to.be.rejected.then(function (error) {
						expect(error).to.have.property('code', 'BalenaRequestError');
						expect(error).to.have.property('statusCode', 400);
						return m.chai
							.expect(error)
							.to.have.property('message')
							.that.contains(
								'It is necessary that each application has an app name that has a Length (Type) that is greater than or equal to 4 and is less than or equal to 100',
							);
					});
				});

				it('should be rejected if the user did not provide an organization parameter', () =>
					m.chai
						.expect(
							// @ts-expect-error
							balena.models.application.create({
								name: 'FooBar',
								deviceType: 'raspberry-pi',
							}),
						)
						.to.be.rejectedWith(
							"undefined is not a valid value for parameter 'organization'",
						));

				it('should be rejected if the user does not have access to find the organization by handle', function () {
					const promise = balena.models.application.create({
						name: 'FooBar',
						deviceType: 'raspberry-pi',
						// add some extra invalid characters to the organization's handle just to be sure
						organization: 'balena-test-non-existing-organization-handle-!@#',
					});
					return m.chai
						.expect(promise)
						.to.be.rejectedWith(
							'Organization not found: balena-test-non-existing-organization-handle-!@#',
						);
				});

				it('should be rejected if the user does not have access to find the organization by id', function () {
					const promise = balena.models.application.create({
						name: 'FooBar',
						deviceType: 'raspberry-pi',
						// This test will fail if org 1 adds the SDK's test user as a member...
						organization: 1,
					});
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Organization not found: 1');
				});
			});

			describe('[mutating operations]', function () {
				afterEach(() =>
					balena.pine.delete({
						resource: 'application',
						options: {
							$filter: { 1: 1 },
						},
					}),
				);

				['id', 'handle'].forEach((prop) =>
					it(`should be able to create an application using the user's initial organization ${prop}`, function () {
						return balena.models.application
							.create({
								name: 'FooBar',
								deviceType: 'raspberrypi',
								organization: this.initialOrg[prop],
							})
							.then(() =>
								balena.models.application.getAll({
									$select: 'id',
									$expand: { organization: { $select: 'id' } },
								}),
							)
							.then((apps) => {
								expect(apps).to.have.length(1);
								return m.chai
									.expect(apps[0])
									.to.have.nested.property(
										'organization[0].id',
										this.initialOrg.id,
									);
							});
					}),
				);

				it('should be able to create an application w/o providing an application type', function () {
					return balena.models.application
						.create({
							name: 'FooBar',
							deviceType: 'raspberry-pi',
							organization: this.initialOrg.id,
						})
						.then(function () {
							const promise = balena.models.application.getAll();
							return expect(promise).to.eventually.have.length(1);
						});
				});

				it('should be able to create an application with a specific application type', function () {
					return balena.models.application
						.create({
							name: 'FooBar',
							applicationType: 'microservices-starter',
							deviceType: 'raspberry-pi',
							organization: this.initialOrg.id,
						})
						.then(function (app) {
							expect(app).to.have.property('id').that.is.a('number');
							m.chai
								.expect(app.is_for__device_type)
								.to.be.an('object')
								.that.has.property('__id')
								.that.is.a('number');

							return balena.models.application
								.getAll({
									$expand: { is_for__device_type: { $select: 'slug' } },
								})
								.then(function (apps) {
									expect(apps).to.have.length(1);
									expect(apps[0]).to.have.property('id', app.id);
									m.chai
										.expect(apps[0])
										.to.have.property('is_for__device_type')
										.that.is.an('array');
									expect(apps[0].is_for__device_type).to.have.length(1);
									return m.chai
										.expect(apps[0].is_for__device_type[0])
										.to.have.property('slug', 'raspberry-pi');
								});
						});
				});

				it('should be able to create a child application', function () {
					return balena.models.application
						.create({
							name: 'FooBar',
							applicationType: 'microservices-starter',
							deviceType: 'raspberry-pi',
							organization: this.initialOrg.id,
						})
						.then((parentApplication) => {
							return balena.models.application
								.create({
									name: 'FooBarChild',
									applicationType: 'microservices-starter',
									deviceType: 'generic',
									organization: this.initialOrg.id,
									parent: parentApplication.id,
								})
								.then(function (childApplication) {
									m.chai
										.expect(childApplication.depends_on__application)
										.to.be.an('object');
									m.chai
										.expect(childApplication.depends_on__application)
										.to.have.property('__id', parentApplication.id);
									// application.getAll() doesn't return dependent apps
									return balena.pine.get({
										resource: 'application',
										options: {
											$select: ['id', 'depends_on__application'],
											$filter: {
												id: {
													$in: [parentApplication.id, childApplication.id],
												},
											},
											$orderby: { id: 'asc' },
										},
									});
								});
						})
						.then(function ([parentApplication, childApplication]) {
							m.chai
								.expect(childApplication.depends_on__application)
								.to.be.an('object');
							return m.chai
								.expect(childApplication.depends_on__application)
								.to.have.property('__id', parentApplication.id);
						});
				});

				it('should be able to create an application using a device type alias', function () {
					return balena.models.application
						.create({
							name: 'FooBar',
							applicationType: 'microservices-starter',
							deviceType: 'raspberrypi',
							organization: this.initialOrg.id,
						})
						.then(function () {
							const promise = balena.models.application.getAll();
							return expect(promise).to.eventually.have.length(1);
						});
				});
			});
		});
	});

	describe('given a single application', function () {
		describe('[read operations]', function () {
			givenAnApplication(before);

			describe('balena.models.application.hasAny()', () =>
				it('should eventually be true', function () {
					const promise = balena.models.application.hasAny();
					return expect(promise).to.eventually.be.true;
				}));

			describe('balena.models.application.create()', function () {
				givenInitialOrganization(before);

				it('should reject if trying to create an app with the same name', function () {
					const promise = balena.models.application.create({
						name: 'FooBar',
						applicationType: 'microservices-starter',
						deviceType: 'beaglebone-black',
						organization: this.initialOrg.id,
					});
					return expect(promise).to.be.rejected.then(function (error) {
						expect(error).to.have.property('code', 'BalenaRequestError');
						expect(error).to.have.property('statusCode', 409);
						return m.chai
							.expect(error)
							.to.have.property('message')
							.that.matches(/\bunique\b/i);
					});
				});
			});
			// TODO: re-enable once the API regression gets fixed
			// expect(error).to.have.property('message').that.contains('Application name must be unique')

			describe('balena.models.application.hasAny()', () =>
				it('should eventually be true', function () {
					const promise = balena.models.application.hasAny();
					return expect(promise).to.eventually.be.true;
				}));

			describe('balena.models.application.getAppByOwner()', function () {
				givenInitialOrganization(before);

				it('should find the created application', function () {
					return balena.models.application
						.getAppByOwner('FooBar', this.initialOrg.handle)
						.then((application) => {
							return m.chai
								.expect(application.id)
								.to.equal(this.application.id);
						});
				});

				it('should not find the created application with a different organization handle', function () {
					const promise = balena.models.application.getAppByOwner(
						'FooBar',
						'test_org_handle',
					);
					return m.chai
						.expect(promise)
						.to.eventually.be.rejectedWith(
							'Application not found: test_org_handle/foobar',
						);
				});
			});

			describe('balena.models.application.getAll()', function () {
				it('should return an array with length 1', function () {
					const promise = balena.models.application.getAll();
					return expect(promise).to.eventually.have.length(1);
				});

				it('should eventually become an array containing the application', function () {
					return balena.models.application.getAll().then((applications) => {
						return m.chai
							.expect(applications[0].id)
							.to.equal(this.application.id);
					});
				});

				it('should support arbitrary pinejs options [Promise]', () =>
					balena.models.application
						.getAll({ $expand: { organization: { $select: 'handle' } } })
						.then((applications) =>
							m.chai
								.expect(applications[0].organization[0].handle)
								.to.equal(credentials.username),
						));

				it('should support arbitrary pinejs options [callback]', function (done) {
					balena.models.application.getAll(
						{ $expand: { organization: { $select: 'handle' } } },
						// @ts-expect-error
						function (err, applications) {
							expect(err).to.be.null;
							m.chai
								.expect(applications[0].organization[0].handle)
								.to.equal(credentials.username);
							return done();
						},
					);
				});
			});

			describe('balena.models.application.get()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should be able to get an application by ${prop}`, function () {
						const promise = balena.models.application.get(
							this.application[prop],
						);
						return expect(promise).to.become(this.application);
					}),
				);

				it('should be able to get an application by slug regardless of casing', function () {
					if (
						this.application.app_name === this.application.slug.toUpperCase()
					) {
						throw new Error(
							'This tests expects the application name to not be fully upper case',
						);
					}

					const promise = balena.models.application.get(
						this.application.slug.toUpperCase(),
					);
					return expect(promise).to.become(this.application);
				});

				it('should be rejected if the application name does not exist', function () {
					const promise = balena.models.application.get('HelloWorldApp');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: HelloWorldApp');
				});

				it('should be rejected if the application id does not exist', function () {
					const promise = balena.models.application.get(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: 999999');
				});

				it('should support arbitrary pinejs options', function () {
					return balena.models.application
						.get(this.application.id, {
							$expand: { organization: { $select: 'handle' } },
						})
						.then((application) =>
							m.chai
								.expect(application.organization[0].handle)
								.to.equal(credentials.username),
						);
				});
			});

			describe('balena.models.application.has()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should eventually be true if the application ${prop} exists`, function () {
						const promise = balena.models.application.has(
							this.application[prop],
						);
						return expect(promise).to.eventually.be.true;
					}),
				);

				it('should return false if the application id is undefined', function () {
					// @ts-expect-error
					const promise = balena.models.application.has(undefined);
					return expect(promise).to.eventually.be.false;
				});

				it('should eventually be false if the application name does not exist', function () {
					const promise = balena.models.application.has('HelloWorldApp');
					return expect(promise).to.eventually.be.false;
				});

				it('should eventually be false if the application id does not exist', function () {
					const promise = balena.models.application.has(999999);
					return expect(promise).to.eventually.be.false;
				});
			});
		});

		describe('[mutating operations]', function () {
			givenAnApplication(beforeEach);

			describe('balena.models.application.remove()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should be able to remove an existing application by ${prop}`, function () {
						return balena.models.application
							.remove(this.application[prop])
							.then(function () {
								const promise = balena.models.application.getAll();
								return expect(promise).to.eventually.have.length(0);
							});
					}),
				);

				it('should be rejected if the application name does not exist', function () {
					const promise = balena.models.application.remove('HelloWorldApp');
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: HelloWorldApp');
				});

				it('should be rejected if the application id does not exist', function () {
					const promise = balena.models.application.remove(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: 999999');
				});
			});

			describe('balena.models.application.generateApiKey()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should be able to generate an API key by ${prop}`, function () {
						return balena.models.application
							.generateApiKey(this.application[prop])
							.then(function (apiKey) {
								expect(_.isString(apiKey)).to.be.true;
								return expect(apiKey).to.have.length(32);
							});
					}),
				);

				it('should be rejected if the application name does not exist', function () {
					const promise = balena.models.application.generateApiKey(
						'HelloWorldApp',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: HelloWorldApp');
				});

				it('should be rejected if the application id does not exist', function () {
					const promise = balena.models.application.generateApiKey(999999);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: 999999');
				});
			});

			describe('balena.models.application.generateProvisioningKey()', function () {
				['id', 'app_name', 'slug'].forEach((prop) =>
					it(`should be able to generate a provisioning key by ${prop}`, function () {
						return balena.models.application
							.generateProvisioningKey(this.application[prop])
							.then(function (key) {
								expect(_.isString(key)).to.be.true;
								return expect(key).to.have.length(32);
							});
					}),
				);

				it('should be rejected if the application name does not exist', function () {
					const promise = balena.models.application.generateProvisioningKey(
						'HelloWorldApp',
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: HelloWorldApp');
				});

				it('should be rejected if the application id does not exist', function () {
					const promise = balena.models.application.generateProvisioningKey(
						999999,
					);
					return m.chai
						.expect(promise)
						.to.be.rejectedWith('Application not found: 999999');
				});
			});

			describe('balena.models.application.grantSupportAccess()', function () {
				it('should throw an error if the expiry time stamp is in the past', function () {
					const expiryTimestamp = Date.now() - 3600 * 1000;

					return m.chai.expect(
						balena.models.application.grantSupportAccess(
							this.application.id,
							expiryTimestamp,
						),
					).to.be.rejected;
				});

				it('should throw an error if the expiry time stamp is undefined', function () {
					return m.chai.expect(
						// @ts-expect-error
						balena.models.application.grantSupportAccess(this.application.id),
					).to.be.rejected;
				});

				it('should grant support access until the specified time', function () {
					const expiryTime = Date.now() + 3600 * 1000;
					const promise = balena.models.application
						.grantSupportAccess(this.application.id, expiryTime)
						.then(() => {
							return balena.models.application.get(this.application.id, {
								$select: 'is_accessible_by_support_until__date',
							});
						})
						.then((app) =>
							Date.parse(app.is_accessible_by_support_until__date),
						);

					return expect(promise).to.eventually.equal(expiryTime);
				});
			});

			describe('balena.models.application.revokeSupportAccess()', () =>
				it('should revoke support access', function () {
					const expiryTime = Date.now() + 3600 * 1000;
					const promise = balena.models.application
						.grantSupportAccess(this.application.id, expiryTime)
						.then(() => {
							return balena.models.application.revokeSupportAccess(
								this.application.id,
							);
						})
						.then(() => {
							return balena.models.application.get(this.application.id, {
								$select: 'is_accessible_by_support_until__date',
							});
						})
						.then((app) => app.is_accessible_by_support_until__date);

					return expect(promise).to.eventually.equal(null);
				}));
		});

		describe('[contained scenario]', function () {
			givenAnApplication(before);

			describe('balena.models.application.tags', function () {
				const tagTestOptions = {
					// prettier-ignore
					model:
						/** @type {import('./tags').TagModelBase<import('../../../').ApplicationTag>} */ (balena.models.application.tags),
					modelNamespace: 'balena.models.application.tags',
					resourceName: 'application',
					uniquePropertyNames: ['app_name', 'slug'],
				};

				beforeEach(function () {
					tagTestOptions.resourceProvider = () => this.application;
				});

				itShouldSetGetAndRemoveTags(tagTestOptions);

				describe('balena.models.application.tags.getAllByApplication()', () =>
					itShouldGetAllTagsByResource(tagTestOptions));
			});

			describe('balena.models.application.configVar', function () {
				const configVarModel = balena.models.application.configVar;

				['id', 'app_name'].forEach(function (appParam) {
					const appParamUpper = appParam.toUpperCase();

					it(`can create a variable by ${appParam}`, function () {
						const promise = configVarModel.set(
							this.application[appParam],
							`BALENA_EDITOR_${appParamUpper}`,
							'vim',
						);
						return expect(promise).to.not.be.rejected;
					});

					it(`...can retrieve a created variable by ${appParam}`, function () {
						return configVarModel
							.get(this.application[appParam], `BALENA_EDITOR_${appParamUpper}`)
							.then((result) => expect(result).to.equal('vim'));
					});

					it(`...can update and retrieve a variable by ${appParam}`, function () {
						return configVarModel
							.set(
								this.application[appParam],
								`BALENA_EDITOR_${appParamUpper}`,
								'emacs',
							)
							.then(() => {
								return configVarModel.get(
									this.application[appParam],
									`BALENA_EDITOR_${appParamUpper}`,
								);
							})
							.then((result) => expect(result).to.equal('emacs'));
					});

					it(`...can delete and then fail to retrieve a variable by ${appParam}`, function () {
						return configVarModel
							.remove(
								this.application[appParam],
								`BALENA_EDITOR_${appParamUpper}`,
							)
							.then(() => {
								return configVarModel.get(
									this.application[appParam],
									`BALENA_EDITOR_${appParamUpper}`,
								);
							})
							.then((result) => expect(result).to.equal(undefined));
					});

					it(`can create and then retrieve multiple variables by ${appParam}`, function () {
						return Promise.all([
							configVarModel.set(
								this.application[appParam],
								`BALENA_A_${appParamUpper}`,
								'a',
							),
							configVarModel.set(
								this.application[appParam],
								`BALENA_B_${appParamUpper}`,
								'b',
							),
						])
							.then(() => {
								return configVarModel.getAllByApplication(
									this.application[appParam],
								);
							})
							.then(function (result) {
								m.chai
									.expect(_.find(result, { name: `BALENA_A_${appParamUpper}` }))
									.to.be.an('object')
									.that.has.property('value', 'a');
								return m.chai
									.expect(_.find(result, { name: `BALENA_B_${appParamUpper}` }))
									.to.be.an('object')
									.that.has.property('value', 'b');
							})
							.then(() =>
								Promise.all([
									configVarModel.remove(
										this.application[appParam],
										`BALENA_A_${appParamUpper}`,
									),
									configVarModel.remove(
										this.application[appParam],
										`BALENA_B_${appParamUpper}`,
									),
								]),
							);
					});
				});
			});

			describe('balena.models.application.envVar', function () {
				const envVarModel = balena.models.application.envVar;

				['id', 'app_name'].forEach(function (appParam) {
					it(`can create a variable by ${appParam}`, function () {
						const promise = envVarModel.set(
							this.application[appParam],
							`EDITOR_BY_${appParam}`,
							'vim',
						);
						return expect(promise).to.not.be.rejected;
					});

					it(`...can retrieve a created variable by ${appParam}`, function () {
						return envVarModel
							.get(this.application[appParam], `EDITOR_BY_${appParam}`)
							.then((result) => expect(result).to.equal('vim'));
					});

					it(`...can update and retrieve a variable by ${appParam}`, function () {
						return envVarModel
							.set(this.application[appParam], `EDITOR_BY_${appParam}`, 'emacs')
							.then(() => {
								return envVarModel.get(
									this.application[appParam],
									`EDITOR_BY_${appParam}`,
								);
							})
							.then((result) => expect(result).to.equal('emacs'));
					});

					it(`...can delete and then fail to retrieve a variable by ${appParam}`, function () {
						return envVarModel
							.remove(this.application[appParam], `EDITOR_BY_${appParam}`)
							.then(() => {
								return envVarModel.get(
									this.application[appParam],
									`EDITOR_BY_${appParam}`,
								);
							})
							.then((result) => expect(result).to.equal(undefined));
					});

					it(`can create and then retrieve multiple variables by ${appParam}`, function () {
						return Promise.all([
							envVarModel.set(
								this.application[appParam],
								`A_BY_${appParam}`,
								'a',
							),
							envVarModel.set(
								this.application[appParam],
								`B_BY_${appParam}`,
								'b',
							),
						])
							.then(() => {
								return envVarModel.getAllByApplication(
									this.application[appParam],
								);
							})
							.then(function (result) {
								m.chai
									.expect(_.find(result, { name: `A_BY_${appParam}` }))
									.to.be.an('object')
									.that.has.property('value', 'a');
								return m.chai
									.expect(_.find(result, { name: `B_BY_${appParam}` }))
									.to.be.an('object')
									.that.has.property('value', 'b');
							})
							.then(() =>
								Promise.all([
									envVarModel.remove(
										this.application[appParam],
										`A_BY_${appParam}`,
									),
									envVarModel.remove(
										this.application[appParam],
										`B_BY_${appParam}`,
									),
								]),
							);
					});
				});
			});

			describe('balena.models.application.buildEnvVar', function () {
				const envVarModel = balena.models.application.buildVar;

				['id', 'app_name'].forEach(function (appParam) {
					it(`can create a variable by ${appParam}`, function () {
						const promise = envVarModel.set(
							this.application[appParam],
							`EDITOR_BY_${appParam}`,
							'vim',
						);
						return expect(promise).to.not.be.rejected;
					});

					it(`...can retrieve a created variable by ${appParam}`, function () {
						return envVarModel
							.get(this.application[appParam], `EDITOR_BY_${appParam}`)
							.then((result) => expect(result).to.equal('vim'));
					});

					it(`...can update and retrieve a variable by ${appParam}`, function () {
						return envVarModel
							.set(this.application[appParam], `EDITOR_BY_${appParam}`, 'emacs')
							.then(() => {
								return envVarModel.get(
									this.application[appParam],
									`EDITOR_BY_${appParam}`,
								);
							})
							.then((result) => expect(result).to.equal('emacs'));
					});

					it(`...can delete and then fail to retrieve a variable by ${appParam}`, function () {
						return envVarModel
							.remove(this.application[appParam], `EDITOR_BY_${appParam}`)
							.then(() => {
								return envVarModel.get(
									this.application[appParam],
									`EDITOR_BY_${appParam}`,
								);
							})
							.then((result) => expect(result).to.equal(undefined));
					});

					it(`can create and then retrieve multiple variables by ${appParam}`, function () {
						return Promise.all([
							envVarModel.set(
								this.application[appParam],
								`A_BY_${appParam}`,
								'a',
							),
							envVarModel.set(
								this.application[appParam],
								`B_BY_${appParam}`,
								'b',
							),
						])
							.then(() => {
								return envVarModel.getAllByApplication(
									this.application[appParam],
								);
							})
							.then(function (result) {
								m.chai
									.expect(_.find(result, { name: `A_BY_${appParam}` }))
									.to.be.an('object')
									.that.has.property('value', 'a');
								return m.chai
									.expect(_.find(result, { name: `B_BY_${appParam}` }))
									.to.be.an('object')
									.that.has.property('value', 'b');
							})
							.then(() =>
								Promise.all([
									envVarModel.remove(
										this.application[appParam],
										`A_BY_${appParam}`,
									),
									envVarModel.remove(
										this.application[appParam],
										`B_BY_${appParam}`,
									),
								]),
							);
					});
				});
			});
		});

		describe('with a registered device', function () {
			givenAnApplication(beforeEach);

			givenADevice(beforeEach);

			describe('balena.models.application.enableDeviceUrls()', () =>
				it("should enable the device url for the application's devices", function () {
					const promise = balena.models.application
						.enableDeviceUrls(this.application.id)
						.then(() => {
							return balena.models.device.hasDeviceUrl(this.device.uuid);
						});

					return expect(promise).to.eventually.be.true;
				}));

			describe('balena.models.application.disableDeviceUrls()', () =>
				it("should disable the device url for the application's devices", function () {
					const promise = balena.models.device
						.enableDeviceUrl(this.device.uuid)
						.then(() => {
							return balena.models.application.disableDeviceUrls(
								this.application.id,
							);
						})
						.then(() => {
							return balena.models.device.hasDeviceUrl(this.device.uuid);
						});

					return expect(promise).to.eventually.be.false;
				}));
		});

		describe('given two releases', function () {
			givenAnApplication(beforeEach);

			beforeEach(async function () {
				const userId = await balena.auth.getUserId();
				this.oldRelease = await balena.pine.post({
					resource: 'release',
					body: {
						belongs_to__application: this.application.id,
						is_created_by__user: userId,
						commit: 'old-release-commit',
						status: 'success',
						source: 'cloud',
						composition: {},
						start_timestamp: 1234,
					},
				});

				this.newRelease = await balena.pine.post({
					resource: 'release',
					body: {
						belongs_to__application: this.application.id,
						is_created_by__user: userId,
						commit: 'new-release-commit',
						status: 'success',
						source: 'cloud',
						composition: {},
						start_timestamp: 54321,
					},
				});
			});

			describe('balena.models.application.willTrackNewReleases()', function () {
				it('should be configured to track new releases by default', function () {
					const promise = balena.models.application.willTrackNewReleases(
						this.application.id,
					);
					return expect(promise).to.eventually.be.true;
				});

				it('should be false when should_track_latest_release is false', function () {
					return balena.pine
						.patch({
							resource: 'application',
							id: this.application.id,
							body: { should_track_latest_release: false },
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						})
						.then(() => {
							return balena.pine.patch({
								resource: 'application',
								id: this.application.id,
								body: { should_track_latest_release: true },
							});
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				});

				it('should be true regardless of the current commit', function () {
					return balena.pine
						.patch({
							resource: 'application',
							id: this.application.id,
							body: { should_be_running__release: this.oldRelease.id },
						})
						.then(() => {
							const promise = balena.models.application.willTrackNewReleases(
								this.application.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				});
			});

			describe('balena.models.application.isTrackingLatestRelease()', function () {
				it('should be tracking the latest release by default', function () {
					const promise = balena.models.application.isTrackingLatestRelease(
						this.application.id,
					);
					return expect(promise).to.eventually.be.true;
				});

				it('should be false when should_track_latest_release is false', function () {
					return balena.pine
						.patch({
							resource: 'application',
							id: this.application.id,
							body: { should_track_latest_release: false },
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						})
						.then(() => {
							return balena.pine.patch({
								resource: 'application',
								id: this.application.id,
								body: { should_track_latest_release: true },
							});
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				});

				it('should be false when the current commit is not of the latest release', function () {
					return balena.pine
						.patch({
							resource: 'application',
							id: this.application.id,
							body: { should_be_running__release: this.oldRelease.id },
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						})
						.then(() => {
							return balena.pine.patch({
								resource: 'application',
								id: this.application.id,
								body: { should_be_running__release: this.newRelease.id },
							});
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				});
			});

			describe('balena.models.application.getTargetReleaseHash()', () =>
				it('should retrieve the commit hash of the current release', function () {
					const promise = balena.models.application.getTargetReleaseHash(
						this.application.id,
					);
					return m.chai
						.expect(promise)
						.to.eventually.equal('new-release-commit');
				}));

			describe('balena.models.application.pinToRelease()', () =>
				it('should set the application to specific release & disable latest release tracking', function () {
					return balena.models.application
						.pinToRelease(this.application.id, 'old-release-commit')
						.then(() => {
							const promise = balena.models.application.getTargetReleaseHash(
								this.application.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('old-release-commit');
						})
						.then(() => {
							const promise = balena.models.application.willTrackNewReleases(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						});
				}));

			describe('balena.models.application.trackLatestRelease()', () =>
				it('should re-enable latest release tracking', function () {
					return balena.models.application
						.pinToRelease(this.application.id, 'old-release-commit')
						.then(() => {
							const promise = balena.models.application.getTargetReleaseHash(
								this.application.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('old-release-commit');
						})
						.then(() => {
							const promise = balena.models.application.willTrackNewReleases(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.false;
						})
						.then(() => {
							return balena.models.application.trackLatestRelease(
								this.application.id,
							);
						})
						.then(() => {
							const promise = balena.models.application.getTargetReleaseHash(
								this.application.id,
							);
							return m.chai
								.expect(promise)
								.to.eventually.equal('new-release-commit');
						})
						.then(() => {
							const promise = balena.models.application.willTrackNewReleases(
								this.application.id,
							);
							return expect(promise).to.eventually.be.true;
						})
						.then(() => {
							const promise = balena.models.application.isTrackingLatestRelease(
								this.application.id,
							);
							return expect(promise).to.eventually.be.true;
						});
				}));
		});
	});

	describe('given a multicontainer application with a single offline device', function () {
		givenMulticontainerApplicationWithADevice(before);

		const itShouldBeAnApplicationWithDeviceServiceDetails = function (
			application,
			expectCommit,
		) {
			// Commit is empty on newly created application, so ignoring it
			if (expectCommit == null) {
				expectCommit = false;
			}
			const omittedFields = [
				'owns__device',
				'should_be_running__release',
				'__metadata',
			];
			m.chai
				.expect(_.omit(application, omittedFields))
				.to.deep.equal(_.omit(this.application, omittedFields));

			// Check the app's target release after the release got created
			m.chai
				.expect(application.should_be_running__release.__id)
				.to.equal(this.currentRelease.id);

			const deviceExpectation = {
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
							...(expectCommit && { commit: 'new-release-commit' }),
							status: 'Downloading',
							download_progress: 50,
						},
						{
							id: this.oldWebInstall.id,
							service_id: this.webService.id,
							image_id: this.oldWebImage.id,
							...(expectCommit && { commit: 'old-release-commit' }),
							status: 'Running',
							download_progress: null,
						},
					],
					db: [
						{
							id: this.newDbInstall.id,
							service_id: this.dbService.id,
							image_id: this.newDbImage.id,
							...(expectCommit && { commit: 'new-release-commit' }),
							status: 'Running',
							download_progress: null,
						},
					],
				},
			};

			expect(application.owns__device).to.have.lengthOf(1);
			const [deviceDetails] = application.owns__device;
			m.chai.expect(deviceDetails).to.deep.match(deviceExpectation);

			// Should include the Device model properties
			m.chai.expect(deviceDetails.image_install).to.have.lengthOf(3);

			deviceDetails.image_install.forEach((imageInstall) => {
				m.chai
					.expect(imageInstall)
					.to.have.property('id')
					.that.is.oneOf([
						this.oldWebInstall.id,
						this.newWebInstall.id,
						this.newDbInstall.id,
					]);
				m.chai
					.expect(imageInstall)
					.to.have.property('download_progress')
					.that.is.oneOf([50, null]);
				m.chai
					.expect(imageInstall)
					.to.have.property('image')
					.that.has.length(1);
				if (expectCommit) {
					m.chai
						.expect(imageInstall)
						.to.have.property('is_provided_by__release')
						.that.has.length(1);
				} else {
					m.chai
						.expect(imageInstall)
						.to.not.have.property('is_provided_by__release');
				}
				m.chai
					.expect(imageInstall)
					.to.have.property('install_date')
					.that.is.a('string');
				m.chai
					.expect(imageInstall)
					.to.have.property('status')
					.that.is.a('string');
				m.chai.expect(imageInstall).to.not.have.property('service_id');
				m.chai.expect(imageInstall).to.not.have.property('image_id');
				m.chai.expect(imageInstall).to.not.have.property('commit');
			});

			m.chai.expect(deviceDetails.gateway_download).to.have.lengthOf(0);

			// Augmented properties
			// Should filter out deleted image installs
			m.chai.expect(deviceDetails.current_services.db).to.have.lengthOf(1);

			// Should have an empty list of gateway downloads
			m.chai
				.expect(deviceDetails.current_gateway_downloads)
				.to.have.lengthOf(0);
		};

		describe('balena.models.application.getWithDeviceServiceDetails()', () =>
			it("should retrieve the application and it's devices along with service details", function () {
				return balena.models.application
					.getWithDeviceServiceDetails(this.application.id)
					.then((applicationDetails) => {
						return itShouldBeAnApplicationWithDeviceServiceDetails.call(
							this,
							applicationDetails,
							true,
						);
					});
			}));

		describe('balena.models.application.getAllWithDeviceServiceDetails()', () =>
			it('should retrieve all applications and their devices, along with service details', function () {
				return balena.models.application
					.getAllWithDeviceServiceDetails(this.application.id)
					.then((applications) => {
						expect(applications).to.have.lengthOf(1);
						return itShouldBeAnApplicationWithDeviceServiceDetails.call(
							this,
							applications[0],
							false,
						);
					});
			}));

		describe('when expanding the release of the image installs', function () {
			// prettier-ignore
			const extraServiceDetailOptions = {
				$expand: {
					owns__device: /** @type {import('../../../').PineOptions<import('../../../').Device>} */ ({
						$expand: {
							image_install: {
								$expand: {
									is_provided_by__release: {
										$select: ['id', 'commit'],
									},
								},
							},
						},
					}),
				},
			};

			describe('balena.models.application.getWithDeviceServiceDetails()', () =>
				it("should retrieve the application and it's devices along with service details including their commit", function () {
					return balena.models.application
						.getWithDeviceServiceDetails(
							this.application.id,
							extraServiceDetailOptions,
						)
						.then((applicationDetails) => {
							return itShouldBeAnApplicationWithDeviceServiceDetails.call(
								this,
								applicationDetails,
								true,
							);
						});
				}));

			describe('balena.models.application.getAllWithDeviceServiceDetails()', () =>
				it('should retrieve all applications and their devices, along with service details including their commit', function () {
					return balena.models.application
						.getAllWithDeviceServiceDetails(extraServiceDetailOptions)
						.then((applications) => {
							expect(applications).to.have.lengthOf(1);
							return itShouldBeAnApplicationWithDeviceServiceDetails.call(
								this,
								applications[0],
								true,
							);
						});
				}));
		});
	});

	describe('helpers', () =>
		describe('balena.models.application.getDashboardUrl()', function () {
			it('should return the respective DashboardUrl when an application id is provided', function () {
				// prettier-ignore
				const dashboardUrl = (/** @type {string} */ (sdkOpts.apiUrl))
					.replace(/api/, 'dashboard');
				return m.chai
					.expect(balena.models.application.getDashboardUrl(1))
					.to.equal(`${dashboardUrl}/apps/1`);
			});

			it('should throw when an application id is not a number', () =>
				m.chai
					.expect(() =>
						// @ts-expect-error
						balena.models.application.getDashboardUrl('my-app'),
					)
					.to.throw());

			it('should throw when an application id is not provided', () =>
				m.chai
					.expect(() =>
						// @ts-expect-error
						balena.models.application.getDashboardUrl(),
					)
					.to.throw());
		}));

	describe('given public apps', function () {
		let publicApp = undefined;

		before(() =>
			// prettier-ignore
			balena.pine
				.get(
					/** @type {import('../../../').PineParams<import('../../../').Application>} */ ({
						resource: 'application',
						options: {
							$top: 1,
							$select: ['id', 'app_name', 'slug', 'is_public'],
							$filter: { is_public: true },
						},
					}),
				)
				.then(function ([app]) {
					expect(app).to.have.property('is_public', true);
					return (publicApp = app);
				}),
		);

		describe('when not being logged in', function () {
			before(() => balena.auth.logout());

			const $it = publicApp ? it : it.skip;

			describe('arbitrary pinejs queries', () =>
				$it(
					'should be able to retrieve the available public apps',
					function () {
						return balena.pine
							.get({
								resource: 'application',
								options: {
									$select: ['id', 'app_name', 'slug', 'is_public'],
								},
							})
							.then(function (apps) {
								expect(apps.length).to.be.gte(1);

								const appIds = apps.map((app) => app.id);
								expect(appIds.includes(publicApp.id)).to.be.true;

								return apps.forEach(function (app) {
									expect(app).to.have.property('id').that.is.a('number');
									m.chai
										.expect(app)
										.to.have.property('app_name')
										.that.is.a('string');
									expect(app).to.have.property('slug').that.is.a('string');
									return expect(app).to.have.property('is_public', true);
								});
							});
					},
				));

			describe('balena.models.application.get()', () =>
				['id', 'app_name', 'slug'].forEach((prop) =>
					$it(
						`should be able to get a public application by ${prop}`,
						function () {
							return balena.models.application
								.get(publicApp[prop])
								.then(function (app) {
									expect(app).to.have.property('id').that.is.a('number');
									m.chai
										.expect(app)
										.to.have.property('app_name')
										.that.is.a('string');
									expect(app).to.have.property('slug').that.is.a('string');
									return expect(app).to.have.property('is_public', true);
								});
						},
					),
				));
		});
	});
});
