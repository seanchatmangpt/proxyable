#!/usr/bin/env fish

# Root level files
touch LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md eslint.config.mjs package.json renovate.json tsconfig.json

# Playground
mkdir -p playground/examples playground/plugins
touch playground/index.js \
      playground/examples/basic-usage.js \
      playground/examples/advanced-usage.js \
      playground/examples/dynamic-method-injection.js \
      playground/examples/read-only-properties.js \
      playground/plugins/loggingPlugin.js \
      playground/plugins/securityPlugin.js \
      playground/plugins/customPlugin.js

# Source files
mkdir -p src/proxy src/interceptors src/plugins src/security src/utils src/context src/types
touch src/index.js \
      src/proxy/create-proxy.js \
      src/proxy/traps.js \
      src/interceptors/index.js \
      src/interceptors/getInterceptors.js \
      src/interceptors/setInterceptors.js \
      src/interceptors/hasInterceptors.js \
      src/interceptors/deletePropertyInterceptors.js \
      src/interceptors/ownKeysInterceptors.js \
      src/interceptors/apply-interceptors.js \
      src/interceptors/constructInterceptors.js \
      src/interceptors/definePropertyInterceptors.js \
      src/interceptors/getOwnPropertyDescriptorInterceptors.js \
      src/interceptors/preventExtensionsInterceptors.js \
      src/interceptors/isExtensibleInterceptors.js \
      src/plugins/index.js \
      src/plugins/pluginManager.js \
      src/plugins/builtInPlugins.js \
      src/security/sandbox.js \
      src/security/interceptorValidation.js \
      src/security/accessControl.js \
      src/utils/logging.js \
      src/utils/performance.js \
      src/utils/helpers.js \
      src/context/context.js \
      src/types/proxyable.d.js

# Test files
mkdir -p test/proxy test/interceptors test/plugins test/security test/utils
touch test/index.test.js \
      test/proxy/create-proxy.test.js \
      test/proxy/traps.test.js \
      test/interceptors/getInterceptors.test.js \
      test/interceptors/setInterceptors.test.js \
      test/interceptors/deletePropertyInterceptors.test.js \
      test/interceptors/applyInterceptors.test.js \
      test/interceptors/ownKeysInterceptors.test.js \
      test/plugins/pluginManager.test.js \
      test/plugins/loggingPlugin.test.js \
      test/plugins/customPlugin.test.js \
      test/security/sandbox.test.js \
      test/security/accessControl.test.js \
      test/utils/logging.test.js \
      test/utils/performance.test.js \
      test/utils/helpers.test.js

# Documentation files
mkdir -p docs
touch docs/introduction.md \
      docs/api.md \
      docs/examples.md \
      docs/plugins.md \
      docs/security.md

echo "Project structure created successfully!"
