# conditional-install (resilient fork)

> ⚠️ **Unofficial fork** - not maintained by the original authors.
Original project (conditional-install):
- [GitHub](https://github.com/ilib-js/conditionalInstall)
- [npm](https://www.npmjs.com/package/conditional-install)

> ⚠️ This fork aims to be drop-in compatible, but intentionally changes runtime behavior (it no longer throws when compatibility data is missing)

### Behavior Differences from Upstream
- Missing compatibility data no longer causes installation failure
- Network/TLS errors are handled gracefully instead of causing repeated retries
- Fallback Node versions are used when exact compatibility data is unavailable

### Improvements in this fork
- Improved compatibility with older Node versions (Node 6+)
- Graceful handling of missing or unreachable compatibility data (no crashes)
- Reduced runtime dependencies (removed unnecessary polyfills)
- Better behavior on newer Node versions without compat data (fallback probing)
- Detects TLS failures and avoids repeated retries (prevents noisy logs on older Node versions)
- Added npm version check with `process.versions.npm`

A utility to install npm packages based on certain conditions.

Why?
--------------------

The original motivation for this package is to install the proper version of
the jest unit testing library.

Some of the ilib packages supported node 6 through the
current latest version and used jest as their unit testing library. The only
problem is that the latest version of jest did not run on node 10 through 13
because it was rewritten with ES6 syntax in jest@27.0.0. The tests, which were
not particularly fancy and did not use any advanced features, ran fine
with jest@26.6.2 on older versions of node but would not work with the latest
jest because it wasn't transpiled to support older versions of node.

What was needed was a way to install jest@26 for older versions of node and
jest@29 for the newer ones. There was no easy, elegant way to do that.

Hence this conditional install package.

How Does it Work?
--------------------

Usage is simple. Basically, modify your package.json to include conditional
dependencies, and then run this package as a postinstall script.

Here is what the package.json would look like:

```json
{
    "name": "mypackage",
    "scripts": {
        "postinstall": "resilient-conditional-install"
    },
    "dependencies": {
        "resilient-conditional-install": "^1.0.0"
    },
    "conditionalDependencies": {
        "process.versions.node >= 14.0.0": {
            "example-package": "^29.0.0"
        },
        "process.versions.node < 14.0.0": {
            "example-package": "^26.0.0"
        }
    }
}
```

If you want to skip TLS validation (for example, when running on older Node versions that cannot validate modern HTTPS certificates), you can add the `--insecure` flag. As of May 2026, older Node versions (notably Node 6–7) may fail to validate modern TLS certificates:

```json
{
    "name": "mypackage",
    "scripts": {
        "postinstall": "resilient-conditional-install --insecure"
    },
    "dependencies": {
        "resilient-conditional-install": "^1.0.0"
    },
    "conditionalDependencies": {
        "process.versions.node >= 14.0.0": {
            "example-package": "^29.0.0"
        },
        "process.versions.node < 14.0.0": {
            "example-package": "^26.0.0"
        }
    }
}
```

> ⚠️ WARNING: Using the `--insecure` flag will skip TLS validation, which can expose you to security risks. Use this flag only if you understand the implications and have a specific reason to do so.

The postinstall script is run automatically by `npm` or `yarn` after the
regular installation is complete. If you are using `npm-ci`, it does not, so
you will have to run `npm-ci run postinstall` explicitly in order to
install the conditional dependencies.

The `conditionalDependencies` object contains properties that are
expressions to test against the current version of node. Inside of the
value object is a list of dependencies to install if the value of that
expression is true. All dependencies inside of the value are installed.
The versions are specified with the same syntax as regular, dev, or peer
dependencies.

When the dependencies are installed, they are installed using the current
package manner, but in such a way that the new dependencies are not saved
to the package.json.

Matching Behavior
----------------------

All conditions are evaluated independently.
If multiple conditions evaluate to true, all matching dependencies will be installed.

It is recommended to write mutually exclusive expressions to avoid installing multiple versions of the same package.

Conditional Expressions
----------------------

The expressions are built on the hard work of
[node-compat-table](https://github.com/williamkapke/node-compat-table).

The core of an expression is a test. There are multiple things that can
be tested:

- A JS "feature" to test against from the node-compat-table project. This tests whether or not
  the current version of node supports that feature. For example, the feature may be
  `RegExp.prototype.flags`. See the [node.green](https://node.green) web site to see all the
  possible features and their pass/fail values for various versions of node.
- ECMAScript versions. If you give then name or alias of a version of ECMAScript, it
  can test to see if the current version of node supports that form of ECMAScript. Examples
  are "ES2015" or "ES6" or "ESM". The data for this is also from node-compat-tables.
- The value of a setting in the `process` variable. There are various different
  possible types of values:
    - numbers. Example: `process.config.variables.icu_ver_major` will give you the major
      version of ICU that this version of node supports as a number
    - strings. Example: `process.ENV.variableName` will return you the value of an environment
      variable as a string. In this way, you can control conditional installation
      with external means. Strings may have spaces and other characters in them
      so that they can represent JS features.
    - versions. Example: `process.versions.node` will return a full version spec,
      like "v14.4.2" or "18.0.0". This may or may not have the leading "v" in front
      of it. Alternatively, `process.version` can also be used and returns the same Node
      version string, though the `process.versions.node` is preferred for consistency
      with other version checks. `process.versions.npm` is also available to check the npm version.
    - booleans. Example: `process.config.variables.icu_small` return true if this
      version of node uses the small ICU package, and false if this version has
      full ICU.

Individual tests can be combined into more complex expressions together using the following
familiar operators. All operators return a boolean value as well.

- `!` is "not". A value can be negated using this unary operator, meaning that the current
version of node does NOT support that feature. Negation for numbers are similar to
Javascript's truthy and falsy. String literals that do not name a JS feature, an ES
version, or a setting inside of the process variable are considered to be false.
- `&&` is "and". Both sides must be true
- `||` is "or". At least one side must be true
- `=` is "equals". Both sides must be equal
- `!=` is "not equal". Both sides must not be equal each other
- `>` is "greater than". Left side must be greater than the right side
- `>=` is "greater than or equal to". Left side must be greater than or equal to the right side
- `<` is "less than". Left side must be less than the right side
- `<=` is "less than or equal to". Left side must be less than or equal to the right side.
- `^` is "major compatibility". For versions, this is the same as carat compatibility in the
  semver package. For strings and numbers, this operator returns false.
- `~` is "minor compatibility". For versions, this is the same as tilde compatibility in the
  semver package. For strings and numbers, this operator returns false.
- `-` is "range". For versions, this is the range operator which forms ranges of versions. For
  strings and numbers, this operator returns false.
- `(` and `)` group expressions together to enforce order of operations

When the two sides of a binary operator are versions, this package will use [semver](https://github.com/npm/node-semver)
to compare them using all the normal, familiar semver rules. Examples:

```
"process.versions.node ^ 14.0.0" -> test whether or not the current version of node
is carat compatible with version 14.0.0

"process.versions.node < v14.0.0" -> test whether or not the current version of node
is less than version 14.0.0
```

If the two sides of an operator are different types, the right side will be co-ersed to the same
type as the left side.
    - strings become numbers with parseInt()
    - numbers become boolean with 0 = false, any other number = true
    - numbers become versions by treating them as a major version number. 14 = v14.0.0
    - strings become booleans by value. "true" is true, and everything else is false

Example of a conditional expression using more complex syntax:

```json
    "conditionalDependencies": {
        "!ES6 || (process.config.variables.icu_ver_major < 67 && process.config.variables.icu_small)": {
            "full-icu": "^1.5.0"
        }
    }
```

> Note: `process.versions.npm` is not a native Node property.
> In this fork, it is derived from the npm user agent when available.
> If npm is not detected, it defaults to "0.0.0".

Conditional Dev Dependencies
--------

If you put "resilient-conditional-install" into the postinstall script, both npm and yarn will run the
conditional installation whether you are doing `npm install` locally in your cloned git repo, or
including your package into another package from the npm repository.

In some cases, you only want to do conditional installation when running locally during development.
To do that, put "resilient-conditional-install" into the "prepare" script instead and include "resilient-conditional-install"
in your `devDependencies` instead:

```json
{
    "name": "mypackage",
    "scripts": {
        "prepare": "resilient-conditional-install"
    },
    "devDependencies": {
        "resilient-conditional-install": "^1.0.0"
    },
    "conditionalDependencies": {
        "process.versions.node >= 14.0.0": {
            "jest": "^29.0.0"
        },
        "process.versions.node < 14.0.0": {
            "jest": "^26.0.0"
        }
    }
}
```

See Also
--------

- Check out the [node.green](https://node.green/) site for all of the features that can be tested against as well
  as a fascinating view of what versions of node support what features.
- Check out [compat-table](https://github.com/compat-table/compat-table) for the raw data, including JS support
  in browsers as well as node.
- [Semver](https://github.com/npm/node-semver) can compare version numbers semantically.

## License

Copyright © 2023-2024, JEDLSoft

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

See the License for the specific language governing permissions and
limitations under the License.

## Release Notes

### v1.1.1
- now working for node 6 and above
- added --insecure flag to skip TLS validation (older node versions may have issues with TLS validation)
- added npm version check with `process.versions.npm`

### v1.1.0

- non-breaking NodeCompat (no crashes on missing compat data, just assumes that the feature is not supported)
- added fallback version probing for newer versions of node that may not have compat data yet
- improved compatibility with older versions of node (Node 8+)
- removed unnecessary `core-js` runtime dependency

Why:
- original version had compatibility issues with older Node versions due to ES module usage; this fork uses CommonJS
- on newer versions of node where the compat data is not yet available, the original version would crash instead of trying to probe the version number and make a best effort to determine compatibility

### Original Releases (from upstream)
### v1.0.3

- update dependencies

### v1.0.2

- now while installing the conditional dependencies, it ignores any automatically run scripts you may have set up
  in your package.json . The original run of npm install will run those scripts properly once the conditional
  install is complete. This prevents a recursive install loop.
- tests now run properly on node 22

### v1.0.1

- fixed a broken "postinstall" script in the package.json
- updated documentation

### v1.0.0

- Initial version

## Even Older Node Versions

Node versions older than 6 are not supported.

This is mainly due to dependencies such as `expressionparser`, which require newer JavaScript features even in earlier versions of this package. Supporting older Node versions would likely require replacing or rewriting parts of the expression parsing logic.

Additionally:
- `semver` would likely need to be downgraded (e.g. to v6 or earlier)
- `node-fetch` may also require a downgrade or replacement

While it may be technically possible to add support for older Node versions, doing so would require non-trivial changes and is currently out of scope.