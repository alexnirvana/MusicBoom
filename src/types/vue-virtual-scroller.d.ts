declare module "vue-virtual-scroller" {
  import type { DefineComponent } from "vue";

  export const RecycleScroller: DefineComponent<any, any, any>;
  export const DynamicScroller: DefineComponent<any, any, any>;
  export const DynamicScrollerItem: DefineComponent<any, any, any>;

  // 有些版本还会导出这个
  export function IdState(): any;
}
