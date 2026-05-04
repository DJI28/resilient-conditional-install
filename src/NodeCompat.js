/*
 * NodeCompat.js - download and represent node compatibility data
 *
 * Copyright © 2023 JEDLSoft
 * Modified by Diogo Domingues, 2026
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fetch = require('node-fetch');

const NODE_RELEASE_INDEX = "https://nodejs.org/download/release/index.json"; // Official Node release index with all versions and release dates
const COMPAT_BASE_URL = "https://raw.githubusercontent.com/williamkapke/node-compat-table/gh-pages/results/v8/";
const MAX_FALLBACK_VERSIONS = 20;

const ECMAScriptAliases = {
    "ES1": "ES1997",
    "ES2": "ES1998",
    "ES3": "ES2000",
    "ES4": "ES2005",
    "ES5": "ES2009",
    "ES6": "ES2015",
    "ES7": "ES2016",
    "ES8": "ES2017",
    "ES9": "ES2018",
    "ES10": "ES2019",
    "ES11": "ES2020",
    "ES12": "ES2021",
    "ES13": "ES2022",
    "ES14": "ES2023",
    "ES15": "ES2024",
    "ES16": "ES2025",
    "ESM": "ES2015",
    "CJS": "ES2009"
};

class NodeCompat {
    constructor() {
        this.init = false;
        this.tlsWarningShown = false;
    }

    /**
     * Download compatibility information for a Node version.
     *
     * @param {string} version version of node to check (Defaults to current runtime)
     * @returns {Promise<boolean>} Resolves true if compatibility data was loaded
     * false if no data was found or loading failed
     */
    async getVersionInfo(version) {
        const nodeVersion = (version || process.versions.node).replace(/^v/, '');

        let result = await this.fetchCompatJson(nodeVersion);

        if (result.ok) {
            console.log(`resilient-conditional-install: Loaded compatibility data for Node ${nodeVersion}.`);
            this.processVersionInfo(nodeVersion, result.data);
            return true;
        }

        if (result.fatal) {
            // If we get a fatal error (like a certificate error), then don't try any more fallbacks
            console.warn(`resilient-conditional-install: Could not load compatibility data for Node ${nodeVersion}: ` +
                `continuing without compatibility checks.`);
            this.init = false;
            return false;
        }

        // If not exact version then try fallback versions (Up to 20 versions back)
        const fallbackVersions = await this.getFallbackVersions(nodeVersion);

        for (const candidateVersion of fallbackVersions) {
            result = await this.fetchCompatJson(candidateVersion);

            if (result.ok) {
                console.warn(`resilient-conditional-install: No compatibility data for Node ${nodeVersion}; ` +
                    `using Node ${candidateVersion} compatibility data instead.`);
                this.processVersionInfo(candidateVersion, result.data);
                return true;
            }

            if (result.fatal) {
                // If we get a fatal error (like a certificate error), then don't try any more fallbacks
                break;
            }
        }

        console.warn(`resilient-conditional-install: No compatibility data found for Node ${nodeVersion} ` +
            `continuing without compatibility checks.`);
        this.init = false;
        return false;
    }

    /**
     * Fetch compatibility JSON data for a specific Node version.
     *
     * @param {string} version Node version
     * @returns {Promise<{ok: boolean, data: Object|null, fatal: boolean}>} Parsed JSON data or null if unavailable
     */
    async fetchCompatJson(version) {
        const url = `${COMPAT_BASE_URL}${version}.json`;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                return {ok: false, data: null, fatal: false};
            }

            const text = await response.text();
            try {
                return {ok: true, data: JSON.parse(text), fatal: false};
            } catch (err) {
                console.warn(`resilient-conditional-install: Failed to parse compatibility data for Node ${version}: ${err}`);
                return {ok: false, data: null, fatal: false};
            }
        } catch (err) {
            if (this.isCertificateError(err)) {
                this.warnTlsOnce(`fetching compatibility data for Node ${version}`);
                return {ok: false, data: null, fatal: true};
            }

            console.warn(`resilient-conditional-install: Failed to fetch compatibility data for Node ${version}: ${err}`);
            return {ok: false, data: null, fatal: false};
        }
    }

    /**
     * Get fallback Node versions to try when exact version data is unavailable.
     * 
     * @param {string} nodeVersion Node version
     * @return {Promise<string[]>} List of fallback versions
     */
    async getFallbackVersions(nodeVersion) {
        try {
            const response = await fetch(NODE_RELEASE_INDEX);

            if (!response.ok) {
                console.warn(`resilient-conditional-install: Failed to fetch Node release index: ${response.statusText}`);
                return [];
            }

            const releases = await response.json();

            const fallbackVersions = releases
                .map(release => release.version.replace(/^v/, ''))
                .filter(version => this.compareVersions(version, nodeVersion) <= 0)
                .filter(version => version !== nodeVersion)
                .slice(0, MAX_FALLBACK_VERSIONS);

            return fallbackVersions;
        } catch (err) {
            if (this.isCertificateError(err)) {
                this.warnTlsOnce("fetching Node release index");
                return [];
            }

            console.warn(`resilient-conditional-install: Failed to fetch Node release index: ${err}`);
            return [];
        }
    }

    /**
     * Compare two version strings (e.g. "14.17.0").
     * @param {string} v1 first version
     * @param {string} v2 second version
     * @returns {number} negative if v1 < v2, positive if v1 > v2, 0 if equal
     */
    compareVersions(v1, v2) {
        const aParts = v1.split('.').map(Number);
        const bParts = v2.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            const diff = (aParts[i] || 0) - (bParts[i] || 0);

            if (diff !== 0) {
                return diff;
            }
        }
        return 0;
    }

    /**
     * Process compatibility data and populate internal indexes.
     *
     * @param {string} version version of node to check
     * @returns {Object} result compatibility data
     */
    processVersionInfo(version, result) {
        // does this version of node support that ECMAScript version?
        // Only put true if more than 99% of features are supported.
        this.esVersions = {};
        Object.keys(result).
            filter(key => !key.startsWith('_')).
            forEach(version => {
                this.esVersions[version] = result[version]._percent > 0.99
            });
        ["ES1997", "ES1998", "ES2000", "ES2005", "ES2009"].forEach(ver => {
            if (typeof(this.esVersions[ver]) === 'undefined') {
                // if it's not mentioned, then just assume the older versions of ECMAScript are supported
                this.esVersions[ver] = true;
            }
        });
        // set the value of the aliases to the same thing as the thing they are aliases to
        for (let alias in ECMAScriptAliases) {
            this.esVersions[alias] = this.esVersions[ECMAScriptAliases[alias]];
        }

        // does this version of node support the named feature?
        this.featureIndex = {};
        this.info = [];

        Object.keys(result)
            .filter(key => !key.startsWith('_'))
            .reverse()
            .forEach(version => {
                const info = result[version];

                Object.keys(info)
                    .filter(key => !key.startsWith('_'))
                    .forEach(key => {
                        const value = info[key];
                        const parts = key.split('›');

                        const entry = {
                            esVersion: version,
                            featureType: parts[0],
                            category: parts[1],
                            feature: parts[2],
                            passed: typeof value === 'string' ? false : value
                        };

                        this.featureIndex[parts[2]] = entry;
                        this.info.push(entry);
                    });
            });
        this.init = true;
    }

    /**
     * Check if a feature exists in the compatibility data.
     * @param {*} name  Feature name
     * @returns  {boolean}
     */
    hasFeature(name) {
        if (!this.init) {
            console.warn(`resilient-conditional-install: No compatibility data loaded; cannot check for feature ${name}.`);
            return false;
        }
        return typeof(this.featureIndex[name]) !== 'undefined';
    }

    /**
     * Check if a feature is supported.
     * @param {*} name  Feature name
     * @returns  {boolean}
     */
    supportsFeature(name) {
        if (!this.init) {
            console.warn(`resilient-conditional-install: No compatibility data loaded; cannot check for feature ${name}.`);
            return false;
        }
        const entry = this.featureIndex[name];
        return !!entry && entry.passed === true;
    }

    /**
     * Check if an ECMAScript version exists.
     * @param {*} version  ECMAScript version
     * @returns  {boolean}
     */
    hasEsVersion(version) {
        if (!this.init) {
            console.warn(`resilient-conditional-install: No compatibility data loaded; cannot check for ECMAScript version ${version}.`);
            return false;
        }
        return typeof(this.esVersions[version]) === 'boolean';
    }

    /**
     * Check if an ECMAScript version is supported.
     * @param {*} version  ECMAScript version
     * @returns  {boolean}
     */
    supportsEsVersion(version) {
        if (!this.init) {
            console.warn(`resilient-conditional-install: No compatibility data loaded; cannot check for ECMAScript version ${version}.`);
            return false;
        }
        return this.esVersions[version] === true;
    }

    /**
     * Check if an error is a certificate error that may indicate a network issue or misconfiguration.
     * @param {*} err  Error object or message
     * @returns  {boolean}
     */
    isCertificateError(err) {
        const msg = String(err && (err.code || err.message || err));

        return (msg.includes('UNABLE_TO_GET_ISSUER_CERT_LOCALLY') || msg.includes('SELF_SIGNED_CERT_IN_CHAIN') || 
            msg.includes('CERT_HAS_EXPIRED') || msg.includes('unable to get local issuer certificate'));
    }

    /**
     * Warn about TLS certificate issues, but only show the warning once per context to avoid spamming the user.
     * @param {string} context  Context of the TLS error (e.g. "fetching compatibility data for Node 14.17.0")
     */
    warnTlsOnce(context) {
        if (!this.tlsWarningShown) {
            console.warn(`resilient-conditional-install: TLS certificate validation failed while ${context}. ` +
                `This may be cause by an old Node version. Use --insecure to bypass TLS validation, or upgrade Node.`);
            this.tlsWarningShown = true;
        }
    }
}

module.exports = { NodeCompat }