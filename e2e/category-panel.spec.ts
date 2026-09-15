import { expect, test } from '@playwright/test'

for (const route of ['/', '/generate']) {
  test(`category panel selects and restores focus on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: route === '/generate' ? 390 : 1280, height: 844 })
    await page.goto(route)
    const trigger = page.getByLabel('Use for', { exact: true })
    await trigger.click()
    const picker = page.getByRole('dialog', { name: 'Choose a category' })
    await expect(picker).toBeVisible()
    await picker.getByRole('option', { name: /Restaurant/ }).click()
    await expect(picker).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(trigger).toContainText(/Restaurant/)
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(picker).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })
}
test('idea entry has no predefined suggestions', async ({ page }) => {
  await page.goto('/generate')
  await expect(page.getByRole('button', { name: 'Coffee shop', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('What are you naming?', { exact: true })).toBeVisible()
})
