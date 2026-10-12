<script setup lang="ts">
import { ArrowUpRight, Check, Plus, Clock3 } from 'lucide-vue-next';
import type { Session } from '../domain';
import Artwork from './Artwork.vue';
defineProps<{ session: Session; selected: boolean; available: number }>();
defineEmits<{ toggle: [id: string] }>();
</script>

<template>
  <article class="session-card" :class="{ selected }">
    <RouterLink
      :to="`/session/${session.id}`"
      class="session-art-link"
      :aria-label="`查看${session.title}详情`"
      ><Artwork :kind="session.art" /><span class="art-link"><ArrowUpRight :size="20" /></span
    ></RouterLink>
    <div class="session-content">
      <div class="session-meta">
        <span>{{ session.category }}</span
        ><span>NO. {{ session.number }}</span>
      </div>
      <h3>
        <RouterLink :to="`/session/${session.id}`">{{ session.title }}</RouterLink>
      </h3>
      <p class="session-time">
        <Clock3 :size="14" /> {{ session.start }}—{{ session.end }}
        <span>余 {{ available }} 席</span>
      </p>
      <button
        class="select-button"
        :class="{ active: selected }"
        :aria-pressed="selected"
        :aria-label="`${selected ? '已加入我的灵感日' : available === 0 ? '本地演示名额已满' : '加入我的灵感日'}：${session.title}${selected ? '（点击移除）' : ''}`"
        :disabled="available === 0 && !selected"
        @click="$emit('toggle', session.id)"
      >
        <Check v-if="selected" :size="17" /><Plus v-else :size="17" />{{
          selected ? '已加入我的灵感日' : available === 0 ? '本地演示名额已满' : '加入我的灵感日'
        }}
      </button>
    </div>
  </article>
</template>
