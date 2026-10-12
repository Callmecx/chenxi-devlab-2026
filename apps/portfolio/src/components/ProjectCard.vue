<script setup lang="ts">
import type { Project } from "../data/projects";
import ProjectVisual from "./ProjectVisual.vue";
defineProps<{ project: Project }>();
</script>
<template>
  <article class="project-card">
    <RouterLink
      :to="`/projects/${project.slug}`"
      class="visual-link"
      :aria-label="`查看 ${project.name} 项目详情`"
      ><ProjectVisual :kind="project.tone" /><span class="card-arrow" aria-hidden="true"
        >↗</span
      ></RouterLink
    >
    <div class="card-meta">
      <span>{{ project.number }} / {{ project.category }}</span
      ><span class="small-status">{{ project.status }}</span>
    </div>
    <h3>
      <RouterLink :to="`/projects/${project.slug}`">{{
        project.name
      }}</RouterLink>
    </h3>
    <p>{{ project.summary }}</p>
    <div class="tags">
      <span v-for="tag in project.tags" :key="tag">{{ tag }}</span>
    </div>
  </article>
</template>
