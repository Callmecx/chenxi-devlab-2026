import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
export default tseslint.config({ ignores: ['dist/**','node_modules/**'] }, ...tseslint.configs.recommended, ...vue.configs['flat/recommended'], {
  files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } },
  rules: { 'vue/multi-word-component-names':'off', 'vue/max-attributes-per-line':'off', 'vue/html-self-closing':'off', 'vue/singleline-html-element-content-newline':'off', 'vue/html-closing-bracket-newline':'off', 'vue/html-indent':'off', 'vue/first-attribute-linebreak':'off' }
})
