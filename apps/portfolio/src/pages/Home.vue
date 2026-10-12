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
          <RouterLink to="/projects" class="button primary"
            >探索我的作品 <ArrowUpRight :size="18" /></RouterLink
          ><RouterLink to="/contact" class="text-link"
            >聊聊你的想法 <ArrowRight :size="17"
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
        <p>两个原创演示应用，真实交互，本地 Mock 数据。</p>
      </div>
      <div class="demo-actions">
        <a :href="demoUrl('shop')"
          ><span>01 / COMMERCE</span><b>逛逛 ShopPilot <ArrowUpRight /></b></a
        ><a :href="demoUrl('pulse')"
          ><span>02 / CAMPAIGN</span><b>体验 PulseCampaign <ArrowUpRight /></b
        ></a>
      </div>
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
