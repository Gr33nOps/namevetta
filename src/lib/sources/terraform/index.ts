/**
 * Terraform Registry check.
 *
 * Terraform module namespaces. HEAD answers 405 here, so this reads the body
 * status the normal way.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const terraformAdapter = exactProbeAdapter({
  id: 'terraform',
  label: 'Terraform Registry',
  probe: (n) => `https://registry.terraform.io/v1/modules/${encodeURIComponent(n)}`,
  page: (n) => `https://registry.terraform.io/modules/${encodeURIComponent(n)}`,
  kind: 'terraform namespace',
})
