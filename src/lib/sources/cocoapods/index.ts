/**
 * CocoaPods check.
 *
 * CocoaPods trunk is the authoritative registry for Swift and Objective-C pods.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const cocoapodsAdapter = exactProbeAdapter({
  id: 'cocoapods',
  label: 'CocoaPods',
  probe: (n) => `https://trunk.cocoapods.org/api/v1/pods/${encodeURIComponent(n)}`,
  page: (n) => `https://cocoapods.org/pods/${encodeURIComponent(n)}`,
  kind: 'cocoa pod',
})
