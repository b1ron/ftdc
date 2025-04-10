import {defineConfig} from 'eslint/config';

const rules = {
  'no-cond-assign': 'off', // eslint:recommended
  'no-irregular-whitespace': 'error', // eslint:recommended
  'no-unexpected-multiline': 'error', // eslint:recommended
  'curly': ['error', 'multi-line'],
  'guard-for-in': 'error',
  'no-caller': 'error',
  'no-extend-native': 'error',
  'no-extra-bind': 'error',
  // 'no-invalid-this': 'error',
  'no-multi-spaces': 'error',
  'no-multi-str': 'error',
  'no-new-wrappers': 'error',
  'no-throw-literal': 'error', // eslint:recommended
  'no-with': 'error',
  'prefer-promise-reject-errors': 'error',
  'no-unused-vars': ['error', {args: 'none'}], // eslint:recommended
  'array-bracket-newline': 'off', // eslint:recommended
  'array-bracket-spacing': ['error', 'never'],
  'array-element-newline': 'off', // eslint:recommended
  'block-spacing': ['error', 'never'],
  'brace-style': 'error',
  'camelcase': ['error', {properties: 'never'}],
  'comma-dangle': ['error', 'always-multiline'],
  'comma-spacing': 'error',
  'comma-style': 'error',
  'computed-property-spacing': 'error',
  'eol-last': 'error',
  'func-call-spacing': 'error',
  'indent': [
    'error',
    2,
    {
      CallExpression: {
        arguments: 2,
      },
      FunctionDeclaration: {
        body: 1,
        parameters: 2,
      },
      FunctionExpression: {
        body: 1,
        parameters: 2,
      },
      MemberExpression: 2,
      ObjectExpression: 1,
      SwitchCase: 1,
      ignoredNodes: ['ConditionalExpression'],
    },
  ],
  'key-spacing': 'error',
  'keyword-spacing': 'error',
  'linebreak-style': 'error',
  'max-len': [
    'error',
    {
      code: 90,
      tabWidth: 2,
      ignoreUrls: true,
      ignorePattern: 'goog.(module|require)',
    },
  ],
  'new-cap': 'error',
  'no-array-constructor': 'error',
  'no-mixed-spaces-and-tabs': 'error', // eslint:recommended
  'no-multiple-empty-lines': ['error', {max: 2}],
  'no-new-object': 'error',
  'no-tabs': 'error',
  'no-trailing-spaces': 'error',
  'object-curly-spacing': 'error',
  'one-var': [
    'error',
    {
      var: 'never',
      let: 'never',
      const: 'never',
    },
  ],
  'operator-linebreak': ['error', 'after'],
  'padded-blocks': ['error', 'never'],
  'quote-props': ['error', 'consistent'],
  'quotes': ['error', 'single', {allowTemplateLiterals: true}],
  'semi': 'error',
  'semi-spacing': 'error',
  'space-before-blocks': 'error',
  'space-before-function-paren': [
    'error',
    {
      asyncArrow: 'always',
      anonymous: 'never',
      named: 'never',
    },
  ],
  'spaced-comment': ['error', 'always'],
  'switch-colon-spacing': 'error',
  'arrow-parens': ['error', 'always'],
  'constructor-super': 'error', // eslint:recommended
  'generator-star-spacing': ['error', 'after'],
  'no-new-symbol': 'error', // eslint:recommended
  'no-this-before-super': 'error', // eslint:recommended
  'no-var': 'error',
  'prefer-const': ['error', {destructuring: 'all'}],
  'prefer-rest-params': 'error',
  'prefer-spread': 'error',
  'rest-spread-spacing': 'error',
  'yield-star-spacing': ['error', 'after'],
  // prevent Node.js globals from being used
  'no-restricted-globals': ['error', 'process', 'global', 'require'],
};

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        window: true,
        document: true,
        console: true,
        fetch: true, // browser-specific globals
        localStorage: true,
        sessionStorage: true,
      },
    },
    rules: rules,
  },
]);
