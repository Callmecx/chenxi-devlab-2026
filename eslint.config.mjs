import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
export default ts.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.tools/**', '**/unpackage/**'] },
  js.configs.recommended, ...ts.configs.recommended, ...vue.configs['flat/recommended'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node, uni: 'readonly', wx: 'readonly' }, parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'] } }, rules: {
    'vue/multi-word-component-names': 'off', 'vue/max-attributes-per-line': 'off', 'vue/html-self-closing': 'off', 'vue/singleline-html-element-content-newline': 'off', 'vue/html-indent': 'off', 'vue/html-closing-bracket-newline': 'off', 'vue/first-attribute-linebreak': 'off', 'vue/attributes-order': 'off', 'vue/multiline-html-element-content-newline': 'off', '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
  } }
);
