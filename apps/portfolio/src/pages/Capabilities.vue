<script setup lang="ts">
const groups = [
  {
    id: "01",
    label: "工作基础",
    title: "把前端做成可维护的产品",
    intro:
      "基于本人确认的正式工作经历：参与中大型前端组件化开发、Vue 管理后台与企业级管理系统全栈开发。",
    skills: [
      {
        name: "JavaScript / TypeScript",
        text: "语言基础、类型约束、异步流程与状态边界。",
      },
      {
        name: "Vue / 前端组件化",
        text: "组件职责、路由组织、表单交互与后台业务页面。",
      },
      {
        name: "Java / Spring Boot",
        text: "企业管理系统、前后端接口协作与全栈业务流程。",
      },
    ],
  },
  {
    id: "02",
    label: "交付实践",
    title: "用工具连接真实业务",
    intro:
      "基于本人确认的客户项目实践；公开页面仅呈现通用技术事实，客户身份、数据和私有实现保持保密。",
    skills: [
      {
        name: "Python / 数据自动化",
        text: "数据采集与处理、任务编排、链上预警与结果输出。",
      },
      {
        name: "Rust / 链上工具",
        text: "类型化数据处理、异步任务、RPC 接口与运行边界。",
      },
      {
        name: "AI 应用工程",
        text: "模型与工具集成、任务流程、运行反馈和人工检查。",
      },
    ],
  },
  {
    id: "03",
    label: "持续深入",
    title: "把新的能力，变成可验证的实践",
    intro:
      "通过本次原创作品持续完善跨端开发、测试自动化和 AI 协同研发。技术熟练度以实际代码和测试证据为准。",
    skills: [
      {
        name: "uni-app / H5",
        text: "同一业务模型下的跨端页面与小程序编译实践。",
      },
      {
        name: "Vitest / Playwright",
        text: "金额与库存单元测试、核心用户流程和响应式检查。",
      },
      {
        name: "工程交付",
        text: "独立构建、GitHub Actions、静态部署与发布前检查。",
      },
    ],
  },
];
</script>
<template>
  <div class="section-wrap page-shell">
    <p class="eyebrow">CAPABILITIES & MINDSET</p>
    <h1 class="page-title">技术是工具。<br /><span>交付是目的。</span></h1>
    <p class="page-intro">
      不把技能写成进度条。用经历说明基础，用项目解释选择，用验证支撑结果。
    </p>
    <section v-for="g in groups" :key="g.id" class="capability-section">
      <div>
        <span class="capability-number">{{ g.id }}</span>
        <p class="eyebrow">{{ g.label }}</p>
        <h2>{{ g.title }}</h2>
        <p>{{ g.intro }}</p>
      </div>
      <div class="skill-list">
        <article v-for="s in g.skills" :key="s.name">
          <h3>{{ s.name }}</h3>
          <p>{{ s.text }}</p>
          <span>↗</span>
        </article>
      </div>
    </section>
    <section class="method-panel">
      <p class="eyebrow">MY DELIVERY LOOP</p>
      <h2>理解 → 建模 → 实现 → 验证</h2>
      <p>
        先梳理用户动作与异常分支，再确定组件、状态和接口；完成后用真实交互验证结果，把限制和证据一起交付。
      </p>
      <RouterLink to="/projects" class="button primary"
        >查看项目中的实践 ↗</RouterLink
      >
    </section>
  </div>
</template>
