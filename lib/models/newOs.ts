/*
Copyright 2016 Balena

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as bSemver from 'balena-semver';
import * as Promise from 'bluebird';
import * as memoizee from 'memoizee';

import {
	Application,
	ApplicationTag,
	ApplicationType,
	Release,
	ResourceTagBase,
	OsVersion,
	DeviceTypeOsVersions,
	ApplicationCanUseApplicationAsHost,
} from '../../typings/balena-sdk';
import { Dictionary } from '../../typings/utils';
import { InjectedDependenciesParam, InjectedOptionsParam } from '../balena';

const HOSTAPPS_ENDPOINT_CACHING_INTERVAL = 10 * 60 * 1000; // 10 minutes

type HostAppTagSet = ReturnType<typeof getHostAppTags>;

enum OsTypes {
	DEFAULT = 'default',
	ESR = 'esr',
}

const RELEASE_POLICY_TAG_NAME = 'release-policy';
const ESR_NEXT_TAG_NAME = 'esr-next';
const ESR_CURRENT_TAG_NAME = 'esr-current';
const ESR_SUNSET_TAG_NAME = 'esr-sunset';
const VARIANT_TAG_NAME = 'variant';
const VERSION_TAG_NAME = 'version';
const BASED_ON_VERSION_TAG_NAME = 'meta-balena-base';

const sortVersions = (a: OsVersion, b: OsVersion) => {
	return bSemver.rcompare(a.rawVersion, b.rawVersion);
};

const getTagValue = (tags: ResourceTagBase[], tagKey: string) => {
	return tags.find((tag) => tag.tag_key === tagKey)?.value;
};

const getHostAppTags = (applicationTag: ApplicationTag[]) => {
	return {
		osType:
			getTagValue(applicationTag, RELEASE_POLICY_TAG_NAME) ?? OsTypes.DEFAULT,
		nextLineVersionRange: getTagValue(applicationTag, ESR_NEXT_TAG_NAME) ?? '',
		currentLineVersionRange:
			getTagValue(applicationTag, ESR_CURRENT_TAG_NAME) ?? '',
		sunsetLineVersionRange:
			getTagValue(applicationTag, ESR_SUNSET_TAG_NAME) ?? '',
	};
};

const getOsReleaseLine = (version: string, appTags: HostAppTagSet) => {
	// All patches belong to the same line.
	if (bSemver.satisfies(version, `^${appTags.nextLineVersionRange}`)) {
		return 'next';
	}
	if (bSemver.satisfies(version, `^${appTags.currentLineVersionRange}`)) {
		return 'current';
	}
	if (bSemver.satisfies(version, `^${appTags.sunsetLineVersionRange}`)) {
		return 'sunset';
	}

	if (appTags.osType?.toLowerCase() === OsTypes.ESR) {
		return 'outdated';
	}
};

const normalizeVariant = (variant: string) => {
	switch (variant) {
		case 'production':
			return 'prod';
		case 'development':
			return 'dev';
		default:
			return variant;
	}
};

const filterVersionsForAppType = (
	versions: OsVersion[],
	appType?: ApplicationType,
) => {
	if (!appType) {
		return versions;
	}

	// If app type is passed, remove any os versions that don't apply to that app type.
	const osVersionRange = appType.needs__os_version_range;
	return versions.filter((version) => {
		if (osVersionRange) {
			const ver = version.strippedVersion;
			return bSemver.satisfies(ver, osVersionRange);
		}

		return true;
	});
};

const getOsVersionsFromReleases = (
	releases: Release[],
	appTags: HostAppTagSet,
): OsVersion[] => {
	return releases.map((release) => {
		// The variant in the tags is a full noun, such as `production` and `development`.
		const variant =
			getTagValue(release.release_tag!, VARIANT_TAG_NAME) ?? 'production';
		const normalizedVariant = normalizeVariant(variant);
		const version = getTagValue(release.release_tag!, VERSION_TAG_NAME) ?? '';
		const basedOnVersion =
			getTagValue(release.release_tag!, BASED_ON_VERSION_TAG_NAME) ?? version;
		const line = getOsReleaseLine(version, appTags);
		const lineFormat = line ? ` (${line})` : '';

		// The version coming from relese tags doesn't contain the variant, so we append it here
		return {
			id: release.id,
			osType: appTags.osType,
			line,
			strippedVersion: version,
			rawVersion: `${version}.${normalizedVariant}`,
			basedOnVersion,
			variant: normalizedVariant,
			formattedVersion: `v${version}${lineFormat}`,
		};
	});
};

// This mutates the passed object.
const transformVersionSets = (
	deviceTypeOsVersions: DeviceTypeOsVersions,
	appType?: ApplicationType,
) => {
	Object.keys(deviceTypeOsVersions).forEach((deviceType) => {
		deviceTypeOsVersions[deviceType] = filterVersionsForAppType(
			deviceTypeOsVersions[deviceType],
			appType,
		);
		deviceTypeOsVersions[deviceType].sort(sortVersions);
		const recommendedPerOsType: Dictionary<boolean> = {};

		// Note: the recommended version settings might come from the server in the future, for now we just set it to the latest version for each os type.
		deviceTypeOsVersions[deviceType].forEach((version) => {
			if (!recommendedPerOsType[version.osType]) {
				if (
					version.variant !== 'dev' &&
					!bSemver.prerelease(version.rawVersion)
				) {
					const additionalFormat = version.line
						? ` (${version.line}, recommended)`
						: ' (recommended)';

					version.isRecommended = true;
					version.formattedVersion = `v${version.strippedVersion}${additionalFormat}`;
					recommendedPerOsType[version.osType] = true;
				}
			}
		});
	});

	return deviceTypeOsVersions;
};

const transformHostApps = (apps: Application[]) => {
	const res: DeviceTypeOsVersions = apps.reduce(
		(deviceTypeOsVersions: DeviceTypeOsVersions, hostApp) => {
			if (!hostApp) {
				return deviceTypeOsVersions;
			}

			const hostAppDeviceType = hostApp.device_type;
			if (!hostAppDeviceType) {
				return deviceTypeOsVersions;
			}

			let osVersions = deviceTypeOsVersions[hostAppDeviceType];
			if (!osVersions) {
				osVersions = [];
			}

			const appTags = getHostAppTags(hostApp.application_tag ?? []);
			osVersions = osVersions.concat(
				getOsVersionsFromReleases(hostApp.owns__release ?? [], appTags),
			);
			deviceTypeOsVersions[hostAppDeviceType] = osVersions;

			return deviceTypeOsVersions;
		},
		{},
	);

	return res;
};

const filterOsVersionsForOsTypes = (
	osVersions: DeviceTypeOsVersions,
	osTypes: string[],
) => {
	return Object.keys(osVersions).reduce(
		(filteredOsVersions: DeviceTypeOsVersions, deviceTypeKey) => {
			filteredOsVersions[deviceTypeKey] = osVersions[
				deviceTypeKey
			].filter((osVersion) => osTypes.includes(osVersion.osType));
			return filteredOsVersions;
		},
		{},
	);
};

const getNewOsModel = function (
	deps: InjectedDependenciesParam,
	_opts: InjectedOptionsParam,
) {
	const { pubsub, pine } = deps;

	// tslint:disable-next-line:ban-types
	const withDeviceTypesEndpointCaching = <T extends (...args: any[]) => any>(
		fn: T,
	) => {
		const memoizedFn = memoizee(fn, {
			maxAge: HOSTAPPS_ENDPOINT_CACHING_INTERVAL,
			primitive: true,
			promise: true,
		});

		pubsub.subscribe('auth.keyChange', () => memoizedFn.clear());

		return memoizedFn;
	};

	const _clearHostappsEndpointCaches = () => {
		getSupportedHostApps.clear();
		_getHostApps.clear();
	};

	const _getHostApps = withDeviceTypesEndpointCaching(
		(deviceTypes: string[]) => {
			return pine.get<Application>({
				resource: 'application',
				options: {
					$filter: {
						is_host: true,
						device_type: { $in: deviceTypes },
					},
					$select: ['id', 'app_name', 'device_type'],
					$expand: {
						application_tag: {
							$select: ['id', 'tag_key', 'value'],
						},
						owns__release: {
							$select: ['id'],
							$expand: {
								release_tag: {
									$select: ['id', 'tag_key', 'value'],
								},
							},
							$filter: {
								is_invalidated: false,
							},
						},
					},
				},
			});
		},
	);

	const getSupportedHostApps = withDeviceTypesEndpointCaching(
		(applicationId: number, deviceTypes: string[]) => {
			return pine.get<ApplicationCanUseApplicationAsHost>({
				resource: 'application__can_use__application_as_host',
				options: {
					$select: ['can_use__application_as_host'],
					$filter: {
						application: applicationId,
						can_use__application_as_host: {
							device_type: { $in: deviceTypes },
						},
					},
					$expand: {
						can_use__application_as_host: {
							$select: ['id', 'app_name', 'device_type'],
							$expand: {
								application_tag: {
									$select: ['id', 'tag_key', 'value'],
								},
							},
						},
					},
				},
			});
		},
	);

	const _getOsVersions = (deviceTypes: string[], appType?: ApplicationType) => {
		const sortedDeviceTypes = deviceTypes.sort();
		return _getHostApps(sortedDeviceTypes)
			.then(transformHostApps)
			.then((deviceTypeOsVersions) =>
				transformVersionSets(deviceTypeOsVersions, appType),
			)
			.tap((deviceTypeOsVersions) => {
				Object.values(deviceTypeOsVersions).forEach((versions) => {
					versions.sort(sortVersions);
				});
			})
			.catch(() => {
				// TODO: Handle properly.
				return {};
			});
	};

	const _getSupportedOsTypes = (
		applicationId: number,
		deviceTypes: string[],
	): Promise<string[]> => {
		return getSupportedHostApps(applicationId, deviceTypes)
			.then((resp) => {
				return resp.reduce((osTypes: Set<string>, hostApps) => {
					const hostApp = (hostApps.can_use__application_as_host as Application[])[0];
					if (!hostApp) {
						return osTypes;
					}

					const appTags = getHostAppTags(hostApp.application_tag ?? []);
					if (appTags.osType) {
						osTypes.add(appTags.osType);
					}

					return osTypes;
				}, new Set<string>());
			})
			.then((osTypesSet) => Array.from(osTypesSet))
			.catch(() => {
				// TODO: Handle error properly
				return [];
			});
	};

	const getSupportedOsVersions = (
		applicationId: number,
		deviceTypes: string[],
		appType?: ApplicationType,
	) => {
		return Promise.all([
			_getOsVersions(deviceTypes, appType),
			_getSupportedOsTypes(applicationId, deviceTypes),
		]).then(([osVersions, osTypes]) => {
			return filterOsVersionsForOsTypes(osVersions, osTypes);
		});
	};

	const hasEsrVersions = (deviceTypes: string[]) => {
		return _getOsVersions(deviceTypes).then(
			(versions: DeviceTypeOsVersions) => {
				return Object.keys(versions).reduce(
					(deviceTypeHasEsr: Dictionary<boolean>, deviceTypeSlug) => {
						deviceTypeHasEsr[deviceTypeSlug] = versions[deviceTypeSlug].some(
							(version) => version.osType === OsTypes.ESR,
						);
						return deviceTypeHasEsr;
					},
					{},
				);
			},
		);
	};

	return {
		_getOsVersions,
		_clearHostappsEndpointCaches,
		getAllOsVersions: _getOsVersions,
		getSupportedOsVersions,
		getSupportedOsTypes: _getSupportedOsTypes,
		// TODO: Maybe we keep this in the dashboard only?
		hasEsrVersions,
		OsTypes,
	};
};

export default getNewOsModel;
