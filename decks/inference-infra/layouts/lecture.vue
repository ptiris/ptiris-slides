<template>
  <div class="slidev-layout lecture-slide">
    <header class="lecture-title"><slot /></header>
    <div class="lecture-body">
      <section v-if="$slots.lead" class="lecture-lead"><slot name="lead" /></section>
      <div class="lecture-columns" :class="{ 'has-aside': !!$slots.right }">
        <section class="lecture-main"><slot name="left" /></section>
        <aside v-if="$slots.right" class="lecture-aside"><slot name="right" /></aside>
      </div>
      <section v-if="$slots.takeaway" class="lecture-takeaway"><slot name="takeaway" /></section>
    </div>
    <footer v-if="$slots.footer" class="lecture-footer"><slot name="footer" /></footer>
  </div>
</template>
