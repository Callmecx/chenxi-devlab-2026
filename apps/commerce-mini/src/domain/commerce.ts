import { findSku } from './catalog'
export interface CartLine { skuId: string; quantity: number; selected: boolean }
export type CouponCode = 'NONE' | 'WELCOME30' | 'SLOW50'
export type OrderStatus = '待发货' | '运输中' | '已完成'
export interface Order { id: string; requestKey: string; createdAt: string; status: OrderStatus; lines: CartLine[]; subtotal: number; discount: number; shipping: number; total: number; coupon: CouponCode; addressId: string }
export interface ShopState { version: 1; cart: CartLine[]; orders: Order[]; addressId: string; coupon: CouponCode }
export const demoAddresses = [
  { id:'studio',name:'体验用户 A',label:'工作室',phone:'虚拟号码 · 不拨打',address:'演示地址 · 成都 · 云杉创意街 01 号' },
  { id:'home',name:'体验用户 B',label:'家',phone:'虚拟号码 · 不拨打',address:'演示地址 · 成都 · 山间生活区 02 号' }
]
export const coupons: {code: CouponCode; name: string; minimum: number; amount: number}[] = [
  {code:'NONE',name:'暂不使用优惠券',minimum:0,amount:0},
  {code:'WELCOME30',name:'新朋友礼遇 · 满 ¥199 减 ¥30',minimum:19900,amount:3000},
  {code:'SLOW50',name:'慢生活礼遇 · 满 ¥399 减 ¥50',minimum:39900,amount:5000}
]
export function emptyState(): ShopState { return {version:1,cart:[],orders:[],addressId:'studio',coupon:'NONE'} }
export function availability(skuId: string, orders: Order[]): number { const sku=findSku(skuId)?.sku; if(!sku) return 0; return Math.max(0,sku.stock-orders.reduce((sum,order)=>sum+order.lines.filter(line=>line.skuId===skuId).reduce((n,line)=>n+line.quantity,0),0)) }
export function checkQuantity(quantity: number) { if(!Number.isInteger(quantity)||quantity<1||quantity>99) throw new Error('数量必须为 1–99 的整数') }
export function setQuantity(state: ShopState, skuId: string, quantity: number): CartLine[] {
  checkQuantity(quantity)
  if(!findSku(skuId)) throw new Error('商品不存在')
  if(quantity>availability(skuId,state.orders)) throw new Error('库存不足，请减少数量或选择其他规格')
  const exists=state.cart.some(line=>line.skuId===skuId)
  return exists ? state.cart.map(line=>line.skuId===skuId?{...line,quantity}:line) : [...state.cart,{skuId,quantity,selected:true}]
}
export function addItem(state: ShopState, skuId: string, quantity=1): CartLine[] { checkQuantity(quantity); return setQuantity(state,skuId,(state.cart.find(line=>line.skuId===skuId)?.quantity??0)+quantity) }
export function calculate(lines: CartLine[], couponCode: CouponCode) {
  const selected=lines.filter(line=>line.selected)
  const subtotal=selected.reduce((sum,line)=>{checkQuantity(line.quantity);const sku=findSku(line.skuId)?.sku;if(!sku)throw new Error('商品不存在');return sum+sku.price*line.quantity},0)
  const coupon=coupons.find(item=>item.code===couponCode)??coupons[0]
  const eligible=subtotal>=coupon.minimum
  const discount=eligible?Math.min(subtotal,coupon.amount):0
  const shipping=subtotal===0||subtotal>=29900?0:1200
  return {subtotal,discount,shipping,total:subtotal-discount+shipping,eligible,count:selected.reduce((sum,line)=>sum+line.quantity,0)}
}
export function placeOrder(state: ShopState, requestKey: string, now=new Date()): {state: ShopState; order: Order} {
  const previous=state.orders.find(order=>order.requestKey===requestKey)
  if(previous) return {state,order:previous}
  if(!requestKey.trim()) throw new Error('无效的提交请求')
  const lines=state.cart.filter(line=>line.selected).map(line=>({...line}))
  if(!lines.length) throw new Error('请先选择需要结算的商品')
  if(!demoAddresses.some(address=>address.id===state.addressId)) throw new Error('请选择演示收货地址')
  for(const line of lines) {checkQuantity(line.quantity);if(line.quantity>availability(line.skuId,state.orders)) throw new Error('库存不足，请返回购物车调整')}
  const totals=calculate(lines,state.coupon)
  if(!totals.eligible) throw new Error('未达到优惠券门槛，请更换优惠券')
  const order: Order={id:`SP${now.getTime()}-${state.orders.length+1}`,requestKey,createdAt:now.toISOString(),status:'待发货',lines,subtotal:totals.subtotal,discount:totals.discount,shipping:totals.shipping,total:totals.total,coupon:state.coupon,addressId:state.addressId}
  return {order,state:{...state,cart:state.cart.filter(line=>!line.selected),orders:[order,...state.orders],coupon:'NONE'}}
}
export function nextStatus(status: OrderStatus): OrderStatus { return status==='待发货'?'运输中':status==='运输中'?'已完成':'已完成' }
function validLines(value: unknown): value is CartLine[] { return Array.isArray(value)&&value.length<=50&&new Set(value.map(line=>line?.skuId)).size===value.length&&value.every(line=>line&&typeof line.skuId==='string'&&findSku(line.skuId)&&Number.isInteger(line.quantity)&&line.quantity>=1&&line.quantity<=99&&typeof line.selected==='boolean') }
export function restoreState(raw: unknown): ShopState {
  try {
    const value=typeof raw==='string'?JSON.parse(raw):raw
    if(!value||value.version!==1||!validLines(value.cart)||!Array.isArray(value.orders)||value.orders.length>500) return emptyState()
    const orders: Order[]=[]
    for(const order of [...value.orders].reverse()) {
      if(!order||typeof order.id!=='string'||typeof order.requestKey!=='string'||typeof order.createdAt!=='string'||!Number.isFinite(Date.parse(order.createdAt))||!['待发货','运输中','已完成'].includes(order.status)||!validLines(order.lines)||!order.lines.length||order.lines.some((line:CartLine)=>!line.selected)||!coupons.some(coupon=>coupon.code===order.coupon)||!demoAddresses.some(address=>address.id===order.addressId)) return emptyState()
      const totals=calculate(order.lines,order.coupon)
      if(!totals.eligible||['subtotal','discount','shipping','total'].some(key=>order[key]!==totals[key as keyof typeof totals])||order.lines.some((line:CartLine)=>line.quantity>availability(line.skuId,orders))||orders.some(previous=>previous.requestKey===order.requestKey||previous.id===order.id))return emptyState()
      orders.push({id:order.id,requestKey:order.requestKey,createdAt:order.createdAt,status:order.status,lines:order.lines.map((line:CartLine)=>({skuId:line.skuId,quantity:line.quantity,selected:true})),subtotal:totals.subtotal,discount:totals.discount,shipping:totals.shipping,total:totals.total,coupon:order.coupon,addressId:order.addressId})
    }
    const cart=value.cart.filter((line:CartLine)=>availability(line.skuId,orders)>0).map((line:CartLine)=>({skuId:line.skuId,quantity:Math.min(line.quantity,availability(line.skuId,orders)),selected:line.selected}))
    return {version:1,cart,orders:orders.reverse(),addressId:demoAddresses.some(address=>address.id===value.addressId)?value.addressId:'studio',coupon:coupons.some(coupon=>coupon.code===value.coupon)?value.coupon:'NONE'}
  } catch { return emptyState() }
}
