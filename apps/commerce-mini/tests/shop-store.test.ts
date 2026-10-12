import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useShop } from '../src/stores/shop'

describe('ShopPilot pending checkout consistency',()=>{
  beforeEach(()=>{
    vi.useFakeTimers()
    vi.stubGlobal('uni',{getStorageSync:()=>'',setStorageSync:vi.fn()})
    setActivePinia(createPinia())
  })
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})

  it('rejects a confirmation changed while awaiting and preserves the latest cart/address',async()=>{
    const shop=useShop()
    shop.add('cup-sand',1)
    const pending=shop.submit('pending-change')
    const rejection=expect(pending).rejects.toThrow('结算信息已变更，请确认后重新提交')
    shop.quantity('cup-sand',2)
    shop.state.addressId='home'
    await vi.advanceTimersByTimeAsync(650)
    await rejection
    expect(shop.state.orders).toHaveLength(0)
    expect(shop.state.cart[0].quantity).toBe(2)
    expect(shop.state.addressId).toBe('home')
    expect(shop.submitting).toBe(false)
    const retry=shop.submit('pending-change')
    await vi.advanceTimersByTimeAsync(650)
    const order=await retry
    expect(order.lines[0].quantity).toBe(2)
    expect(order.addressId).toBe('home')
    expect(shop.state.orders).toHaveLength(1)
  })

  it('locks concurrent submissions and releases the lock on successful completion',async()=>{
    const shop=useShop()
    shop.add('cup-sand')
    const first=shop.submit('same-request')
    expect(shop.submitting).toBe(true)
    await expect(shop.submit('same-request')).rejects.toThrow('订单正在提交')
    await vi.advanceTimersByTimeAsync(650)
    await first
    expect(shop.submitting).toBe(false)
    expect(shop.state.orders).toHaveLength(1)
  })

  it('preserves a failed confirmation and releases the lock for retry',async()=>{
    const shop=useShop()
    shop.add('cup-sand')
    const before=JSON.stringify(shop.state)
    const pending=shop.submit('network-retry',true)
    const rejection=expect(pending).rejects.toThrow('模拟网络失败')
    await vi.advanceTimersByTimeAsync(650)
    await rejection
    expect(JSON.stringify(shop.state)).toBe(before)
    expect(shop.submitting).toBe(false)
    const retry=shop.submit('network-retry')
    await vi.advanceTimersByTimeAsync(650)
    await retry
    expect(shop.state.orders).toHaveLength(1)
  })
})
