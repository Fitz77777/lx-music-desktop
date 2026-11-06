<template>
  <material-modal :show="show" teleport="#view" @close="handleClose" @after-enter="handleAfterEnter">
    <main :class="$style.main">
      <h2>{{ $t('user_api_import_online__title') }}</h2>
      <textarea
        ref="input"
        v-model="urlText"
        :class="$style.textarea"
        :disabled="disabled"
        :placeholder="$t('user_api_import_online__input_tip')"
        spellcheck="false"
      />
      <div v-if="results" :class="$style.result" class="scroll">
        <template v-if="results.success.length">
          <p :class="$style.successTitle">{{ $t('user_api_import_online__summary_success_tip', { n: results.success.length }) }}</p>
          <p v-for="item in results.success" :key="item.url" :class="$style.successItem">
            <span v-if="item.skipped" :class="$style.skipTip">{{ item.message }}</span>
            <template v-else>{{ item.name }}</template>
          </p>
        </template>
        <template v-if="results.failed.length">
          <p :class="$style.failedTitle">{{ $t('user_api_import_online__summary_failed_tip', { n: results.failed.length }) }}</p>
          <p v-for="(item, index) in results.failed" :key="index" :class="$style.failedItem">{{ item.url }}：{{ item.message }}</p>
        </template>
      </div>
      <div :class="$style.footer">
        <base-btn v-if="results && results.failed.length" :class="$style.btn" :disabled="disabled" @click="handleRetry">{{ $t('user_api_import_online__btn_retry') }}</base-btn>
        <base-btn :class="$style.btn" @click="handleClose">{{ $t('btn_close') }}</base-btn>
        <base-btn v-if="!results" :class="$style.btn" :disabled="disabled" @click="handleSubmit">{{ btnText }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script>
import { dialog } from '@renderer/plugins/Dialog'
import { httpFetch } from '@renderer/utils/request'

const MAX_SCRIPT_SIZE = 9_000_000
const MAX_SOURCE_NUM = 20

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    // 已存在的源数量（用于批量导入上限预检）
    listCount: {
      type: Number,
      default: 0,
    },
    // 导入单个脚本，成功返回 { name }，失败抛出异常
    importHandler: {
      type: Function,
      required: true,
    },
  },
  emits: ['update:show', 'import'],
  data() {
    return {
      urlText: '',
      disabled: false,
      btnText: '',
      results: null,
    }
  },
  watch: {
    show(n) {
      if (n) {
        this.urlText = ''
        this.disabled = false
        this.results = null
        this.btnText = this.$t('user_api_import_online__input_confirm')
      }
    },
  },
  methods: {
    handleClose() {
      if (this.disabled) return
      this.$emit('update:show', false)
    },
    handleAfterEnter() {
      this.$refs.input?.focus()
    },
    parseUrls(text) {
      return [...new Set(text.split(/\s+/).map(str => str.trim()).filter(url => /^https?:\/\//i.test(url)))]
    },
    verifyMax(urls) {
      const successCount = this.results?.success.filter(item => !item.skipped).length ?? 0
      if (this.listCount + successCount + urls.length > MAX_SOURCE_NUM) {
        void dialog({
          message: this.$t('user_api__max_tip'),
          confirmButtonText: this.$t('ok'),
        })
        return true
      }
      return false
    },
    async fetchScript(url) {
      const script = await httpFetch(url, { follow_max: 3 }).promise.then(resp => resp.body)
      if (script.length > MAX_SCRIPT_SIZE) throw new Error('Too large script')
      return script
    },
    async handleBatch(urls) {
      this.disabled = true
      const total = urls.length
      let current = 0
      for (const url of urls) {
        current++
        this.btnText = this.$t('user_api_import_online__input_loading', { current, total })
        try {
          const { name } = await this.importHandler(await this.fetchScript(url))
          this.results.success.push({ url, name, skipped: false })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('与已有的源')) {
            // 主进程对重复脚本的报错会附带已有源信息，归类为跳过
            this.results.success.push({ url, message, skipped: true })
          } else {
            this.results.failed.push({ url, message })
          }
        }
      }
      this.disabled = false
      this.btnText = this.$t('user_api_import_online__input_confirm')
    },
    async handleSubmit() {
      const urls = this.parseUrls(this.urlText)
      if (!urls.length) {
        void dialog({
          message: this.$t('user_api_import_online__empty_tip'),
          confirmButtonText: this.$t('ok'),
        })
        return
      }
      if (this.verifyMax(urls)) return
      if (!this.results) this.results = { success: [], failed: [] }
      await this.handleBatch(urls)
    },
    async handleRetry() {
      const urls = (this.results?.failed ?? []).map(item => item.url)
      if (!urls.length) return
      if (this.verifyMax(urls)) return
      this.urlText = urls.join('\n')
      this.results.failed = []
      await this.handleBatch(urls)
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 0 15px;
  width: 450px;
  min-width: 280px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 13px;
    color: var(--color-font);
    line-height: 1.3;
    word-break: break-all;
    // text-align: center;
    padding: 15px 0 8px;
  }
}

.textarea {
  width: 100%;
  height: 150px;
  border: none;
  outline: none;
  border-radius: 4px;
  padding: 5px;
  background-color: var(--color-primary-light-200-alpha-900);
  box-sizing: border-box;
  font-family: inherit;
  resize: none;
}

.result {
  flex: none;
  max-height: 180px;
  margin-top: 8px;
  p {
    line-height: 1.4;
    word-break: break-all;
  }
}

.successTitle {
  color: var(--color-theme);
  font-size: 13px;
}

.failedTitle {
  color: var(--color-font);
  font-size: 13px;
  & + p {
    margin-bottom: 4px;
  }
}

.successItem {
  color: var(--color-font);
  font-size: 12px;
}

.skipTip {
  color: var(--color-font-label);
  font-size: 12px;
}

.failedItem {
  color: var(--color-font-label);
  font-size: 12px;
}

.footer {
  margin: 20px 0 15px auto;
}
.btn {
  // box-sizing: border-box;
  // margin-left: 15px;
  // margin-bottom: 15px;
  // height: 36px;
  // line-height: 36px;
  // padding: 0 10px !important;
  min-width: 70px;
  // .mixin-ellipsis-1();

  +.btn {
    margin-left: 10px;
  }
}


</style>
