import { expect, test } from '@playwright/test'
import { signIn, winEasyGame, wonCount } from './app'
import { invitedEmail } from './db'

test('a win on one device shows up on another device of the same Account', async ({ browser }) => {
  const email = invitedEmail('sync')
  const phone = await (await browser.newContext()).newPage()
  const laptop = await (await browser.newContext()).newPage()
  await phone.goto('/')
  await laptop.goto('/')
  await signIn(phone, email)
  await phone.keyboard.press('Escape')
  await signIn(laptop, email)
  await laptop.keyboard.press('Escape')

  await winEasyGame(phone)
  await phone.getByRole('dialog', { name: 'Puzzle Solved!' }).getByRole('button', { name: 'Home' }).click()

  // A win syncs right away; the other device picks it up on its next sync.
  await expect(async () => {
    await laptop.getByRole('button', { name: /^Account/ }).click()
    await laptop.getByRole('button', { name: 'Sync now' }).click()
    await expect(laptop.getByText(/Last synced/)).toBeVisible()
    await laptop.keyboard.press('Escape')
    expect(await wonCount(laptop)).toBe('1')
  }).toPass({ timeout: 15_000 })
})

test('signing out keeps progress in the Account and clears the device', async ({ page }) => {
  const email = invitedEmail('signout')
  await page.goto('/')
  await signIn(page, email)
  await page.keyboard.press('Escape')
  await winEasyGame(page)
  await page.getByRole('dialog', { name: 'Puzzle Solved!' }).getByRole('button', { name: 'Home' }).click()

  await page.getByRole('button', { name: /^Account/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('alertdialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await wonCount(page)).toBe('0')

  await signIn(page, email)
  await page.keyboard.press('Escape')
  expect(await wonCount(page)).toBe('1')
})

test('an address not on the Invite List gets the same reply and cannot sign in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Account/ }).click()
  await page.getByLabel('Email').fill('stranger@example.test')
  await page.getByRole('button', { name: 'Send sign-in email' }).click()
  await expect(page.getByText(/a sign-in email is on its way/)).toBeVisible()
  await page.getByRole('group', { name: 'Sign-in Code' }).getByRole('textbox').first().click()
  await page.keyboard.type('123456')
  await expect(page.getByText("That code didn't work.", { exact: false })).toBeVisible()
})
