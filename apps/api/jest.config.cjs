module.exports = {
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'es6' },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
