<script setup lang="ts">
import {
  ArrowUpRight,
  ArrowRight,
  Code2,
  Layers3,
  Workflow,
  Check,
} from "lucide-vue-next";
import { projects, demoUrl } from "../data/projects";
import ProjectCard from "../components/ProjectCard.vue";
</script>
<template>
  <div>
    <section class="hero section-wrap">
      <div class="hero-copy">
        <div class="eyebrow">
          <span class="status-dot"></span> CHENXI / DEVELOPER & BUILDER
        </div>
        <h1>
          从业务需求，<br />到<span class="serif-accent">工程交付。</span
          ><span class="hero-period">*</span>
        </h1>
        <p class="hero-description">
          我是 Chenxi，一名关注业务与体验的开发者。<br />用扎实的前端、全栈与 AI
          应用能力，<br class="desktop-break" />把复杂问题做成清晰、可用的产品。
        </p>
        <div class="hero-cta">
          <RouterLink to="/intelligence" class="button primary"
            >体验智能演化实验室 <ArrowUpRight :size="18" /></RouterLink
          ><RouterLink to="/projects" class="text-link"
            >查看工程作品 <ArrowRight :size="17"
          /></RouterLink>
        </div>
        <div class="hero-bottom">
          <span>BASED IN CHENGDU, CN</span
          ><span>前端体验 · 全栈系统 · AI 应用</span>
        </div>
      </div>
      <div class="hero-lab">
        <div class="lab-topline">
          <span><i></i> THE DEVELOPER'S DESK</span><span>VOL. 2026 / 01</span>
        </div>
        <div class="lab-grid"></div>
        <div class="orbit-label">IDEA → BUILD → SHIP</div>
        <div class="lab-window">
          <div class="window-toolbar">
            <span class="window-dots"><i></i><i></i><i></i></span
            ><span>chenxi / workspace</span><Code2 :size="14" />
          </div>
          <div class="lab-window-body">
            <div class="window-eyebrow">BUILDING WITH INTENTION</div>
            <div class="window-title">
              Ideas into<br /><span>interfaces.</span>
            </div>
            <div class="window-code">
              <span>const</span> developer = {<br />&nbsp; focus:
              <b>'solve real problems'</b>,<br />&nbsp; craft:
              <b>'care about details'</b><br />};
            </div>
            <div class="window-foot">
              <span class="status-dot"></span> 让每一个交互，都有回应。
            </div>
          </div>
        </div>
        <div class="lab-note">
          <span class="note-pin"></span><span>GOOD SOFTWARE</span
          ><b>始于理解，<br />成于细节。</b><i>less noise, more purpose.</i>
        </div>
        <div class="floating-tag">
          <Check :size="15" /> Design meets engineering
        </div>
        <div class="lab-coordinates">
          30.57° N &nbsp; 104.06° E<span>✳</span>
        </div>
      </div>
    </section>
    <div class="skill-strip">
      <div class="section-wrap">
        <span>MY TOOLKIT</span><b>Vue.js</b><span>✳</span><b>TypeScript</b
        ><span>✳</span><b>Java</b><span>✳</span><b>Python</b><span>✳</span
        ><b>Rust</b><span>✳</span><b>AI Engineering</b>
      </div>
    </div>
    <section class="v2-feature section-wrap" aria-label="精选交互作品">
      <div class="v2-feature-intro">
        <p class="eyebrow">INTENT → PLAN → ACT → REFLECT</p>
        <h2>让目标变成行动，<br /><span>让过程可以观察。</span></h2>
        <p>
          为轨道港送去三份能源，关闭航道，比较两种未来。<br />在星域智航，亲手检验智能如何改变下一步。
        </p>
        <div>
          <RouterLink class="button primary" to="/intelligence"
            >进入实验室 <ArrowUpRight :size="17" /></RouterLink
          ><RouterLink class="text-link" to="/intelligence/tasks"
            >查看实用任务库 <ArrowRight :size="16"
          /></RouterLink>
        </div>
      </div>
      <div class="v2-feature-map" aria-label="四个精选作品入口">
        <RouterLink to="/intelligence"
          ><span>01 / INTELLIGENCE</span>
          <h3>星域智航 · 智能实验室 <ArrowUpRight :size="19" /></h3>
          <p>双载体调度 · 改变航道 · 时间分岔 · 事件回放</p>
          <small>本地算法仿真与历史回放</small></RouterLink
        ><a :href="demoUrl('shop')"
          ><span>02 / COMMERCE</span>
          <h3>巷集 Select <ArrowUpRight :size="19" /></h3>
          <p>SKU · 金额 · 库存 · 订单状态</p>
          <small>静态体验 / 可连接本地 API</small></a
        ><a :href="demoUrl('pulse')"
          ><span>03 / WEEKEND</span>
          <h3>蓉城周末 Lab <ArrowUpRight :size="19" /></h3>
          <p>偏好推荐 · 场次 · 预约与取消</p>
          <small>原创虚构活动与模拟履约</small></a
        ><RouterLink to="/labs/market-replay"
          ><span>04 / MARKET DATA</span>
          <h3>金融事件回放 <ArrowUpRight :size="19" /></h3>
          <p>时间游标 · 缺口补偿 · 前缀计算</p>
          <small>合成事件数据 / 不接交易</small></RouterLink
        >
      </div>
    </section>
    <section class="section-wrap section-space">
      <div class="section-heading">
        <div>
          <p class="eyebrow">01 / SELECTED WORK</p>
          <h2>代码之外，<span>解决问题。</span></h2>
        </div>
        <RouterLink to="/projects" class="text-link"
          >全部项目 <ArrowUpRight :size="18"
        /></RouterLink>
      </div>
      <div class="projects-grid">
        <ProjectCard
          v-for="p in projects.slice(0, 4)"
          :key="p.slug"
          :project="p"
        />
      </div>
    </section>
    <section class="approach section-wrap section-space">
      <div class="approach-heading">
        <p class="eyebrow">02 / HOW I BUILD</p>
        <h2>不止于实现，<br /><span>也在意如何实现。</span></h2>
        <p>
          从真实场景出发，把业务规则、界面细节<br />和工程可靠性放在同一张工作台上。
        </p>
        <RouterLink to="/capabilities" class="text-link"
          >了解技术与方法 <ArrowUpRight :size="18"
        /></RouterLink>
      </div>
      <div class="approach-list">
        <article>
          <Code2 :size="24" />
          <div>
            <h3>清晰的界面，扎实的基础</h3>
            <p>组件化 Vue、类型安全与响应式布局，让复杂流程也能自然地使用。</p>
          </div>
          <span>01</span>
        </article>
        <article>
          <Layers3 :size="24" />
          <div>
            <h3>理解业务，也照顾边界</h3>
            <p>从状态变化、接口约定到失败重试，完成可检查的业务闭环。</p>
          </div>
          <span>02</span>
        </article>
        <article>
          <Workflow :size="24" />
          <div>
            <h3>与 AI 协作，用证据交付</h3>
            <p>让 AI 参与研发，用代码审查、业务测试和真实浏览器验证质量。</p>
          </div>
          <span>03</span>
        </article>
      </div>
    </section>
    <section class="demo-band section-wrap">
      <div>
        <p class="eyebrow">LESS TALK, MORE INTERACTION</p>
        <h2>好的作品，<br />欢迎你亲手试试。</h2>
        <p>从移动体验到工程边界，用可操作流程解释实现。</p>
      </div>
      <div class="demo-actions">
        <a :href="demoUrl('shop')"
          ><span>01 / COMMERCE</span><b>逛逛巷集 Select <ArrowUpRight /></b></a
        ><a :href="demoUrl('pulse')"
          ><span>02 / CAMPAIGN</span><b>体验蓉城周末 Lab <ArrowUpRight /></b
        ></a>
      </div>
    </section>
    <section class="v2-engineering-links section-wrap">
      <RouterLink to="/labs/enterprise-flow"
        ><Code2 :size="22" />
        <div>
          <h3>技术面试模式</h3>
          <p>沿业务状态操作，再追问为什么这样实现。</p>
        </div>
        <ArrowUpRight :size="20" /></RouterLink
      ><RouterLink to="/writing"
        ><Layers3 :size="22" />
        <div>
          <h3>工程笔记</h3>
          <p>记录库存、回放与状态边界的实际取舍。</p>
        </div>
        <ArrowUpRight :size="20"
      /></RouterLink>
      <RouterLink to="/labs/engineering"
        ><Workflow :size="22" />
        <div>
          <h3>三个工程实验</h3>
          <p>并发库存、请求恢复与十万行列表。</p>
        </div>
        <ArrowUpRight :size="20"
      /></RouterLink>
    </section>
    <section class="contact-teaser section-wrap section-space">
      <p class="eyebrow">HAVE A PROJECT IN MIND?</p>
      <RouterLink to="/contact"
        ><h2>
          下一件好作品，<span>一起做。<ArrowUpRight /></span></h2
      ></RouterLink>
      <p>寻找前端 / 全栈 / AI 应用方向的合作机会。</p>
    </section>
  </div>
</template>
<style scoped>
.v2-feature {
  margin-top: 70px;
  margin-bottom: 20px;
  display: grid;
  grid-template-columns: 0.95fr 1.05fr;
  gap: 65px;
  align-items: center;
}
.v2-feature-intro h2 {
  font-size: 35px;
  line-height: 1.5;
  letter-spacing: -1px;
}
.v2-feature-intro h2 span {
  color: var(--muted);
}
.v2-feature-intro > p:not(.eyebrow) {
  font-size: 14px;
}
.v2-feature-intro > div {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 27px;
}
.v2-feature-intro .button {
  font-size: 13px;
}
.v2-feature-map {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--line);
  border-radius: 13px;
  overflow: hidden;
  background: var(--paper);
}
.v2-feature-map > a {
  padding: 25px;
  transition: background 0.2s;
  min-width: 0;
}
.v2-feature-map > a:first-child {
  background: #102e31;
  color: #e1f5ec;
}
.v2-feature-map > a:first-child :is(p, small) {
  color: #abd4c6;
}
.v2-feature-map > a:nth-child(even) {
  border-left: 1px solid var(--line);
}
.v2-feature-map > a:nth-child(n + 3) {
  border-top: 1px solid var(--line);
}
.v2-feature-map > a:hover {
  background: var(--surface);
}
.v2-feature-map > a:first-child:hover {
  background: #1c4141;
}
.v2-feature-map span {
  font: 9px monospace;
  letter-spacing: 1px;
  color: var(--muted);
}
.v2-feature-map > a:first-child span {
  color: #a7dcce;
}
.v2-feature-map h3 {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 16px;
  margin: 20px 0 12px;
}
.v2-feature-map p {
  font-size: 11px;
  line-height: 1.8;
  margin-bottom: 15px;
}
.v2-feature-map small {
  font-size: 9px;
  color: var(--muted);
}
.v2-engineering-links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--line);
  margin-top: 65px;
  padding-top: 30px;
  gap: 25px;
}
.v2-engineering-links > a {
  display: flex;
  gap: 18px;
  align-items: center;
}
.v2-engineering-links > a > svg:last-child {
  margin-left: auto;
}
.v2-engineering-links h3 {
  font-size: 18px;
  margin: 0 0 5px;
}
.v2-engineering-links p {
  font-size: 12px;
  margin: 0;
}
@media (max-width: 1000px) {
  .v2-feature {
    gap: 30px;
  }
  .v2-feature-intro h2 {
    font-size: 29px;
  }
  .v2-feature-map > a {
    padding: 19px;
  }
  .v2-feature-map h3 {
    font-size: 14px;
  }
}
@media (max-width: 740px) {
  .v2-feature {
    grid-template-columns: 1fr;
    gap: 30px;
    margin-top: 48px;
  }
  .v2-feature-intro h2 {
    font-size: 29px;
  }
  .v2-feature-map > a {
    padding: 20px 16px;
  }
  .v2-feature-map h3 {
    font-size: 14px;
    line-height: 1.6;
    margin-top: 16px;
  }
  .v2-feature-map h3 svg {
    width: 15px;
  }
  .v2-feature-map small {
    font-size: 9px;
  }
  .v2-engineering-links {
    grid-template-columns: 1fr;
    gap: 28px;
    margin-top: 40px;
  }
  .v2-feature-intro .text-link {
    font-size: 12px;
  }
}
</style>
