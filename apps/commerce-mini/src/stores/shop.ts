import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { addItem, emptyState, nextStatus, placeOrder, restoreState, setQuantity, type ShopState } from '../domain/commerce'
export const STORAGE_KEY='chenxi-shoppilot-v1'
export const useShop=defineStore('shop',()=>{
  const state=ref<ShopState>(emptyState())
  const storageWarning=ref('')
  try {state.value=restoreState(uni.getStorageSync(STORAGE_KEY))}catch{storageWarning.value='本地存储不可用，本次操作将仅保存在当前会话。'}
  watch(state,value=>{try{uni.setStorageSync(STORAGE_KEY,JSON.stringify(value));storageWarning.value=''}catch{storageWarning.value='本地保存失败，刷新页面可能丢失当前更改。'}},{deep:true,flush:'sync'})
  const submitting=ref(false)
  function add(skuId:string,quantity=1){state.value.cart=addItem(state.value,skuId,quantity)}
  function quantity(skuId:string,count:number){state.value.cart=setQuantity(state.value,skuId,count)}
  function remove(skuId:string){state.value.cart=state.value.cart.filter(line=>line.skuId!==skuId)}
  function toggle(skuId:string){const line=state.value.cart.find(item=>item.skuId===skuId);if(line)line.selected=!line.selected}
  async function submit(requestKey:string,fail=false){
    if(submitting.value) throw new Error('订单正在提交，请稍候')
    submitting.value=true
    const fingerprint=()=>JSON.stringify({cart:state.value.cart,addressId:state.value.addressId,coupon:state.value.coupon})
    const confirmedCheckout=fingerprint()
    try {
      await new Promise(resolve=>setTimeout(resolve,650))
      // The confirmation belongs to the state seen at click time. Never silently
      // submit different items/address if navigation changes it during the mock request.
      if(fingerprint()!==confirmedCheckout)throw new Error('结算信息已变更，请确认后重新提交')
      if(fail)throw new Error('模拟网络失败，购物车已保留，请重试')
      const result=placeOrder(state.value,requestKey)
      state.value=result.state
      return result.order
    }finally{submitting.value=false}
  }
  function advance(id:string){const order=state.value.orders.find(item=>item.id===id);if(order)order.status=nextStatus(order.status)}
  function reset(){state.value=emptyState()}
  return {state,storageWarning,submitting,add,quantity,remove,toggle,submit,advance,reset}
})
