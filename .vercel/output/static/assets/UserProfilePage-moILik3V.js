import{f as e,s as t,t as n,u as r}from"./jsx-runtime-C9blZ9AR.js";import{t as i}from"./createLucideIcon-3jWuKSqo.js";import{t as a}from"./CascadingAddressSelector-DjtAHiDZ.js";import{t as o}from"./external-link-BnDIAqrx.js";import{t as s}from"./lock-DdJnFEuD.js";import{n as ee,t as c}from"./save-DrPLqkE_.js";import{D as l,P as te,S as ne,Y as u,a as d,b as f,c as p,d as m,i as re,it as h,j as g,m as _,p as v,v as y}from"./index-BSe2moGn.js";var b=i(`settings`,[[`path`,{d:`M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915`,key:`1i5ecw`}],[`circle`,{cx:`12`,cy:`12`,r:`3`,key:`1v7zrd`}]]),x=e(r(),1),S=n();function C(){let{currentUser:e,updateUserProfile:n,changePassword:r,logoutUser:i,orders:C,rates:w,oliveYoungCatalog:T,addToCart:ie,userTheme:E,setUserTheme:D,toggleUserTheme:ae}=(0,x.useContext)(h),O=te(),k=t(),[A,j]=(0,x.useState)(`profile`),[M,oe]=(0,x.useState)(`all`),[N,P]=(0,x.useState)(``),[F,I]=(0,x.useState)(null),se=w?.KRW?.rate||19.5,L=1+(w?.serviceFeePercent??5)/100,R=(e,t)=>{let n=e?.name||t?.productName,r=T?.find(t=>t.id===e?.productId||n&&t.name?.toLowerCase()===n.toLowerCase());I(r||{id:e?.productId||t?.id||`temp-id`,name:n||`Sản phẩm Hàn Quốc`,brand:e?.brand||t?.brand||`Olive Young`,productImage:e?.productImage||t?.productImage,images:e?.productImage?[e.productImage]:t?.productImage?[t.productImage]:[],foreignPrice:e?.foreignPrice||t?.foreignPrice||0,description:`Sản phẩm mua hộ trực tiếp từ Hàn Quốc.`,options:e?.options||t?.options||`Tiêu chuẩn`})},[z,B]=(0,x.useState)(e?.name||``),[V,H]=(0,x.useState)(e?.phone||``),[U,W]=(0,x.useState)(e?.address||``),[G,K]=(0,x.useState)(``),[q,J]=(0,x.useState)(``),[Y,X]=(0,x.useState)(``),[ce,le]=(0,x.useState)(null);e&&(e.uid||e.id)!==ce&&(le(e.uid||e.id),B(e.name||``),H(e.phone||``),W(e.address||``));let ue=async e=>{if(e.preventDefault(),!z.trim()){O&&O(`Vui lòng nhập họ và tên!`,`error`);return}if(!/^0[3|5|7|8|9][0-9]{8}$/.test(V)){O&&O(`Số điện thoại không hợp lệ. Vui lòng nhập SĐT gồm 10 chữ số bắt đầu bằng 03, 05, 07, 08, 09.`,`error`);return}if(!U||U.trim()===``||U.includes(`Chưa chọn`)){O&&O(`Vui lòng chọn địa chỉ nhận hàng đầy đủ.`,`error`);return}let t=await n({name:z,phone:V,address:U});t.success?O&&O(`Cập nhật hồ sơ cá nhân thành công!`,`success`):O&&O(t.message||`Lỗi cập nhật hồ sơ`,`error`)},de=async t=>{if(t.preventDefault(),!G){O&&O(`Vui lòng nhập mật khẩu hiện tại!`,`error`);return}if(e?.password&&G!==e.password){O&&O(`Mật khẩu hiện tại không chính xác!`,`error`);return}if(!q){O&&O(`Vui lòng nhập mật khẩu mới!`,`error`);return}if(q!==Y){O&&O(`Mật khẩu xác nhận không trùng khớp!`,`error`);return}let i=r?await r(G,q):await n({password:q});i.success?(O&&O(`Đổi mật khẩu thành công!`,`success`),K(``),J(``),X(``)):O&&O(i.message||`Lỗi đổi mật khẩu`,`error`)},fe=async()=>{await i(),O&&O(`Đã đăng xuất tài khoản test!`,`success`),k(`/login`)},Z=e=>e||e===0?`${new Intl.NumberFormat(`vi-VN`).format(Math.round(e))} VNĐ`:`0 VNĐ`,pe=e=>{navigator.clipboard.writeText(e),P(e),setTimeout(()=>P(``),2500)};if(!e)return(0,S.jsx)(`div`,{style:{padding:`80px 20px`,textAlign:`center`,minHeight:`60vh`,backgroundColor:`#FDFBF7`},children:(0,S.jsxs)(`div`,{style:{maxWidth:`400px`,margin:`0 auto`,backgroundColor:`#FFF`,padding:`40px`,borderRadius:`16px`,border:`1px solid #E5E7EB`,boxShadow:`0 4px 20px rgba(0,0,0,0.03)`},children:[(0,S.jsx)(y,{size:54,style:{color:`var(--purple-primary)`,marginBottom:`16px`}}),(0,S.jsx)(`h2`,{style:{fontSize:`1.5rem`,fontWeight:700,marginBottom:`8px`,color:`#111827`},children:`Vui lòng đăng nhập`}),(0,S.jsx)(`p`,{style:{color:`#6B7280`,marginBottom:`24px`,fontSize:`0.9rem`,lineHeight:`1.5`},children:`Bạn cần đăng nhập tài khoản để xem thông tin cá nhân và theo dõi đơn hàng của mình.`}),(0,S.jsx)(`button`,{className:`btn-submit`,onClick:()=>k(`/login`),style:{width:`100%`,display:`inline-flex`,alignItems:`center`,justifyContent:`center`,backgroundColor:`var(--purple-primary)`,color:`#FFF`,border:`none`,padding:`14px`,borderRadius:`12px`,fontWeight:600,cursor:`pointer`},children:`Đăng nhập ngay`})]})});let Q=(C||[]).filter(t=>t.userEmail&&t.userEmail.toLowerCase()===e.email.toLowerCase()||t.customerPhone&&e.phone&&t.customerPhone===e.phone).filter(e=>M===`all`||e.status===M),$=re,me=e=>d(e);return(0,S.jsxs)(`div`,{style:{backgroundColor:`var(--bg-ivory, #FDFBF7)`,minHeight:`90vh`,width:`100%`,color:`var(--text-dark)`},children:[(0,S.jsx)(`style`,{children:`
        .profile-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 30px;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        @media (max-width: 992px) {
          .profile-layout {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 20px 12px;
          }
        }
        .sidebar-card {
          background-color: var(--bg-white, #FFF);
          border-radius: 16px;
          border: 1px solid var(--border-color, #E5E7EB);
          box-shadow: var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.015));
          padding: 24px;
          display: flex;
          flex-direction: column;
          height: fit-content;
        }
        .content-card {
          background-color: var(--bg-white, #FFF);
          border-radius: 16px;
          border: 1px solid var(--border-color, #E5E7EB);
          box-shadow: var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.015));
          padding: 30px;
        }
        @media (max-width: 768px) {
          .content-card {
            padding: 20px;
          }
        }
        .menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          background: none;
          color: var(--text-dark, #4B5563);
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          border-radius: 12px;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
          position: relative;
        }
        .menu-item:hover {
          background-color: var(--bg-subtle-purple, #F9FAFB);
          color: var(--purple-primary);
        }
        .menu-item.active {
          background-color: var(--purple-light, #F5F3FF);
          color: var(--purple-primary);
          font-weight: 600;
        }
        .menu-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 15%;
          height: 70%;
          width: 4px;
          background-color: var(--purple-primary);
          border-radius: 0 4px 4px 0;
        }
        .logout-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          background: none;
          color: #EF4444;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          border-radius: 12px;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
        }
        .logout-item:hover {
          background-color: #FEF2F2;
        }
        .badge-verified {
          background: #D1FAE5;
          color: #065F46;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          display: inline-block;
        }
        .avatar-circle {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background-color: var(--purple-primary);
          color: #FFF;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0 auto 12px auto;
          box-shadow: 0 4px 10px rgba(122, 75, 158, 0.15);
        }
        .input-field {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          outline: none;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .input-field:focus {
          border-color: var(--purple-primary);
          box-shadow: 0 0 0 3px rgba(122, 75, 158, 0.1);
        }
        .btn-submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background-color: var(--purple-primary);
          color: #FFF;
          border: none;
          padding: 14px 28px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-submit:hover {
          opacity: 0.9;
        }
        .order-tab-btn {
          padding: 8px 18px;
          border-radius: 20px;
          border: 1px solid #E5E7EB;
          background-color: #FFF;
          color: #374151;
          font-weight: 500;
          font-size: 0.85rem;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .order-tab-btn.active {
          border-color: var(--purple-primary);
          background-color: var(--purple-primary);
          color: #FFF;
          font-weight: 700;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
        }
        .form-label {
          font-size: 0.88rem;
          font-weight: 600;
          color: #4B5563;
        }
        .order-details-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 24px;
          align-items: center;
        }
        @media (max-width: 768px) {
          .order-details-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }
      `}),(0,S.jsxs)(`div`,{className:`profile-layout`,children:[(0,S.jsxs)(`div`,{className:`sidebar-card`,children:[(0,S.jsxs)(`div`,{style:{textAlign:`center`,marginBottom:`24px`,borderBottom:`1px solid var(--border-color, #E5E7EB)`,paddingBottom:`20px`},children:[(0,S.jsx)(`div`,{className:`avatar-circle`,children:e.name?e.name.charAt(0).toUpperCase():`U`}),(0,S.jsx)(`h3`,{style:{margin:`8px 0 4px 0`,fontSize:`1.15rem`,color:`var(--text-dark, #111827)`,fontWeight:700},children:e.name||`Khách Hàng TAVY`}),(0,S.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,justifyContent:`center`,gap:`6px`,margin:`0 0 12px 0`,color:`var(--text-muted, #6B7280)`,fontSize:`0.85rem`},children:[(0,S.jsx)(ee,{size:14}),(0,S.jsx)(`span`,{style:{wordBreak:`break-all`},children:e.email})]}),(0,S.jsx)(`span`,{className:`badge-verified`,children:`Tài Khoản Xác Thực`})]}),(0,S.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`},children:[(0,S.jsxs)(`button`,{className:`menu-item ${A===`profile`?`active`:``}`,onClick:()=>j(`profile`),children:[(0,S.jsx)(m,{size:18}),(0,S.jsx)(`span`,{children:`Thông tin tài khoản`})]}),(0,S.jsxs)(`button`,{className:`menu-item ${A===`password`?`active`:``}`,onClick:()=>j(`password`),children:[(0,S.jsx)(s,{size:18}),(0,S.jsx)(`span`,{children:`Đổi mật khẩu`})]}),(0,S.jsxs)(`button`,{className:`menu-item ${A===`orders`?`active`:``}`,onClick:()=>j(`orders`),children:[(0,S.jsx)(y,{size:18}),(0,S.jsx)(`span`,{children:`Đơn hàng của tôi`})]}),(0,S.jsxs)(`button`,{className:`menu-item ${A===`settings`?`active`:``}`,onClick:()=>j(`settings`),children:[(0,S.jsx)(b,{size:18}),(0,S.jsx)(`span`,{children:`Cài đặt & Giao diện`})]}),(0,S.jsx)(`div`,{style:{height:`1px`,backgroundColor:`var(--border-color, #E5E7EB)`,margin:`16px 0`}}),(0,S.jsxs)(`button`,{className:`logout-item`,onClick:fe,children:[(0,S.jsx)(ne,{size:18}),(0,S.jsx)(`span`,{children:`Đăng xuất`})]})]})]}),(0,S.jsxs)(`div`,{className:`content-card`,children:[A===`profile`&&(0,S.jsxs)(`div`,{children:[(0,S.jsxs)(`h3`,{style:{margin:`0 0 24px 0`,fontSize:`1.25rem`,fontWeight:700,color:`var(--purple-primary)`,display:`flex`,alignItems:`center`,gap:`10px`},children:[(0,S.jsx)(m,{size:22}),`HỒ SƠ VÀ SỔ ĐỊA CHỈ GIAO HÀNG`]}),(0,S.jsxs)(`form`,{onSubmit:ue,children:[(0,S.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:`20px`,marginBottom:`10px`},children:[(0,S.jsxs)(`div`,{className:`form-group`,children:[(0,S.jsx)(`label`,{className:`form-label`,children:`Họ và tên *`}),(0,S.jsx)(`input`,{type:`text`,className:`input-field`,value:z,onChange:e=>B(e.target.value),placeholder:`Nhập họ và tên của bạn...`,required:!0})]}),(0,S.jsxs)(`div`,{className:`form-group`,children:[(0,S.jsx)(`label`,{className:`form-label`,children:`Số điện thoại chính *`}),(0,S.jsx)(`input`,{type:`tel`,className:`input-field`,value:V,onChange:e=>H(e.target.value.replace(/[^0-9]/g,``)),placeholder:`Nhập số điện thoại (10 số)...`,required:!0})]})]}),(0,S.jsx)(`div`,{style:{marginBottom:`24px`},children:(0,S.jsx)(a,{initialAddress:e?.address||U,onChange:e=>W(e.fullAddress),required:!0})}),(0,S.jsxs)(`button`,{type:`submit`,className:`btn-submit`,children:[(0,S.jsx)(c,{size:18}),(0,S.jsx)(`span`,{children:`LƯU THAY ĐỔI HỒ SƠ`})]})]})]}),A===`password`&&(0,S.jsxs)(`div`,{children:[(0,S.jsxs)(`h3`,{style:{margin:`0 0 24px 0`,fontSize:`1.25rem`,fontWeight:700,color:`var(--purple-primary)`,display:`flex`,alignItems:`center`,gap:`10px`},children:[(0,S.jsx)(s,{size:22}),`ĐỔI MẬT KHẨU TÀI KHOẢN`]}),(0,S.jsxs)(`form`,{onSubmit:de,children:[(0,S.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`16px`,maxWidth:`500px`,marginBottom:`28px`},children:[(0,S.jsxs)(`div`,{className:`form-group`,style:{marginBottom:0},children:[(0,S.jsx)(`label`,{className:`form-label`,children:`Mật khẩu hiện tại *`}),(0,S.jsx)(`input`,{type:`password`,className:`input-field`,value:G,onChange:e=>K(e.target.value),placeholder:`Nhập mật khẩu hiện tại...`,required:!0})]}),(0,S.jsxs)(`div`,{className:`form-group`,style:{marginBottom:0},children:[(0,S.jsx)(`label`,{className:`form-label`,children:`Mật khẩu mới *`}),(0,S.jsx)(`input`,{type:`password`,className:`input-field`,value:q,onChange:e=>J(e.target.value),placeholder:`Nhập mật khẩu mới...`,required:!0})]}),(0,S.jsxs)(`div`,{className:`form-group`,style:{marginBottom:0},children:[(0,S.jsx)(`label`,{className:`form-label`,children:`Xác nhận mật khẩu mới *`}),(0,S.jsx)(`input`,{type:`password`,className:`input-field`,value:Y,onChange:e=>X(e.target.value),placeholder:`Nhập lại mật khẩu mới...`,required:!0})]})]}),(0,S.jsxs)(`button`,{type:`submit`,className:`btn-submit`,children:[(0,S.jsx)(c,{size:18}),(0,S.jsx)(`span`,{children:`CẬP NHẬT MẬT KHẨU`})]})]})]}),A===`orders`&&(0,S.jsxs)(`div`,{children:[(0,S.jsxs)(`h3`,{style:{margin:`0 0 20px 0`,fontSize:`1.25rem`,fontWeight:700,color:`var(--purple-primary)`,display:`flex`,alignItems:`center`,gap:`10px`},children:[(0,S.jsx)(y,{size:22}),`ĐƠN HÀNG CỦA TÔI`]}),(0,S.jsx)(`div`,{style:{display:`flex`,gap:`10px`,overflowX:`auto`,marginBottom:`28px`,paddingBottom:`8px`},children:[{id:`all`,label:`Tất cả đơn`},{id:`pending`,label:`Chờ cọc`},{id:`deposit_paid`,label:`Đã cọc 100%`},{id:`purchased`,label:`Đang mua hộ`},{id:`transit`,label:`Shipping`},{id:`completed`,label:`Hoàn thành`}].map(e=>(0,S.jsx)(`button`,{onClick:()=>oe(e.id),className:`order-tab-btn ${M===e.id?`active`:``}`,children:e.label},e.id))}),Q.length===0?(0,S.jsxs)(`div`,{style:{border:`1px dashed #D1D5DB`,borderRadius:`16px`,padding:`60px 20px`,textAlign:`center`},children:[(0,S.jsx)(_,{size:48,style:{color:`var(--purple-primary)`,marginBottom:`12px`,opacity:.8}}),(0,S.jsx)(`h4`,{style:{fontSize:`1.1rem`,fontWeight:600,marginBottom:`6px`,color:`#374151`},children:`Chưa tìm thấy đơn hàng nào`}),(0,S.jsx)(`p`,{style:{fontSize:`0.9rem`,color:`#6B7280`,marginBottom:`20px`},children:`Hãy chọn mua các sản phẩm Mỹ phẩm & Thực phẩm chức năng Hàn Quốc chất lượng!`}),(0,S.jsx)(`button`,{className:`btn-submit`,onClick:()=>k(`/`),children:`Khám phá sản phẩm ngay`})]}):(0,S.jsx)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`24px`},children:Q.map(e=>{let t=me(e.status),n=w?.KRW?.rate||19.5,r=1+(w?.serviceFeePercent??5)/100,i=u(e,w);return(0,S.jsxs)(`div`,{style:{backgroundColor:`var(--bg-white, #FFF)`,borderRadius:`16px`,border:`1px solid var(--border-color, #E5E7EB)`,boxShadow:`var(--shadow-sm)`,overflow:`hidden`},children:[(0,S.jsxs)(`div`,{style:{padding:`16px 24px`,backgroundColor:`var(--bg-subtle-purple, #F9FAFB)`,borderBottom:`1px solid var(--border-color, #E5E7EB)`,display:`flex`,justifyContent:`space-between`,alignItems:`center`,flexWrap:`wrap`,gap:`12px`},children:[(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`span`,{style:{fontSize:`0.75rem`,color:`var(--text-muted, #6B7280)`,textTransform:`uppercase`,letterSpacing:`1px`,fontWeight:600},children:`MÃ ĐƠN HÀNG`}),(0,S.jsx)(`h4`,{style:{fontSize:`1.05rem`,fontWeight:700,color:`var(--purple-primary)`,margin:`2px 0 0 0`},children:e.id})]}),(0,S.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`15px`},children:[(0,S.jsxs)(`div`,{style:{textAlign:`right`},children:[(0,S.jsx)(`span`,{style:{fontSize:`0.75rem`,color:`var(--text-muted, #6B7280)`},children:`Ngày đặt:`}),(0,S.jsx)(`div`,{style:{fontSize:`0.85rem`,fontWeight:600,color:`var(--text-dark, #374151)`},children:new Date(e.createdAt).toLocaleDateString(`vi-VN`)})]}),(0,S.jsxs)(`div`,{style:{textAlign:`right`,paddingLeft:`15px`,borderLeft:`1px solid var(--border-color, #E5E7EB)`},children:[(0,S.jsx)(`span`,{style:{fontSize:`0.75rem`,color:`var(--text-muted, #6B7280)`},children:`Tổng thanh toán:`}),(0,S.jsx)(`div`,{style:{fontSize:`1.05rem`,fontWeight:800,color:`var(--text-dark, #111827)`},children:Z(i)})]})]})]}),(0,S.jsx)(`div`,{style:{padding:`30px 24px`,backgroundColor:`var(--bg-subtle-purple, #FDFBFF)`,borderBottom:`1px solid var(--border-color, #E5E7EB)`,overflowX:`auto`},children:(0,S.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,position:`relative`,minWidth:`700px`},children:[(0,S.jsx)(`div`,{style:{position:`absolute`,top:`16px`,left:`5%`,right:`5%`,height:`3px`,backgroundColor:`var(--border-color, #E5E7EB)`,zIndex:1},children:(0,S.jsx)(`div`,{style:{height:`100%`,backgroundColor:`var(--purple-primary)`,width:`${t/($.length-1)*100}%`,transition:`width 0.4s ease`}})}),$.map((e,n)=>{let r=n<=t,i=n===t;return(0,S.jsxs)(`div`,{style:{zIndex:2,textAlign:`center`,flex:1},children:[(0,S.jsx)(`div`,{style:{width:`32px`,height:`32px`,borderRadius:`50%`,backgroundColor:r?`var(--purple-primary)`:`var(--bg-white, #FFF)`,color:r?`#FFF`:`var(--text-muted, #9CA3AF)`,border:r?`2px solid var(--purple-primary)`:`2px solid var(--border-color, #E5E7EB)`,display:`inline-flex`,alignItems:`center`,justifyContent:`center`,fontWeight:700,fontSize:`0.8rem`,marginBottom:`8px`,boxShadow:i?`0 0 0 4px rgba(122, 75, 158, 0.2)`:`none`,transition:`all 0.3s ease`},children:r?(0,S.jsx)(g,{size:16}):n+1}),(0,S.jsx)(`div`,{style:{fontSize:`0.75rem`,fontWeight:i?700:500,color:r?`var(--purple-primary)`:`#6B7280`,whiteSpace:`nowrap`},children:e.title})]},e.key)})]})}),(()=>{let t=!!(e.trackingCode||e.paymentStatus===`paid`&&e.status!==`pending`);return(0,S.jsx)(`div`,{style:{padding:`20px 24px`},children:(0,S.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:t?`1.2fr 1fr`:`1fr`,gap:`20px`,alignItems:`center`},children:[(0,S.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`16px`},children:[e.items?e.items.map((t,i)=>{let a=t.priceVnd||t.price||Math.round((Number(t.foreignPrice??t.priceKrw??t.priceWon)||0)*n*r),s=a*(t.qty||1);return(0,S.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,alignItems:`center`,justifyContent:`space-between`,borderBottom:i<e.items.length-1?`1px dashed #E5E7EB`:`none`,paddingBottom:i<e.items.length-1?`12px`:0},children:[(0,S.jsxs)(`div`,{onClick:()=>R(t,e),style:{display:`flex`,gap:`16px`,alignItems:`center`,flex:1,cursor:`pointer`},title:`Bấm để xem chi tiết sản phẩm`,children:[(0,S.jsx)(`img`,{src:t.productImage,alt:``,style:{width:`56px`,height:`56px`,objectFit:`cover`,borderRadius:`10px`,border:`1px solid #E5E7EB`,transition:`transform 0.2s ease`}}),(0,S.jsxs)(`div`,{children:[(0,S.jsxs)(`h4`,{style:{fontSize:`0.9rem`,fontWeight:700,color:`var(--purple-primary)`,marginBottom:`4px`,lineHeight:`1.4`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,S.jsx)(`span`,{children:t.name}),(0,S.jsx)(o,{size:14,style:{opacity:.7}})]}),(0,S.jsxs)(`p`,{style:{fontSize:`0.8rem`,color:`#6B7280`,margin:0},children:[t.options?`${t.options} | `:``,`Số lượng: x`,t.qty||1]})]})]}),(0,S.jsxs)(`div`,{style:{textAlign:`right`,minWidth:`130px`},children:[(0,S.jsx)(`div`,{style:{fontSize:`0.92rem`,fontWeight:700,color:`var(--purple-primary)`},children:Z(s)}),(0,S.jsxs)(`div`,{style:{fontSize:`0.78rem`,color:`#6B7280`,marginTop:`2px`},children:[Z(a),` × `,t.qty||1]})]})]},i)}):(0,S.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,alignItems:`center`,justifyContent:`space-between`},children:[(0,S.jsxs)(`div`,{onClick:()=>R(null,e),style:{display:`flex`,gap:`16px`,alignItems:`center`,flex:1,cursor:`pointer`},title:`Bấm để xem chi tiết sản phẩm`,children:[e.productImage&&(0,S.jsx)(`img`,{src:e.productImage,alt:``,style:{width:`64px`,height:`64px`,objectFit:`cover`,borderRadius:`10px`,border:`1px solid #E5E7EB`}}),(0,S.jsxs)(`div`,{children:[(0,S.jsxs)(`h4`,{style:{fontSize:`0.9rem`,fontWeight:700,color:`var(--purple-primary)`,marginBottom:`4px`,lineHeight:`1.4`,display:`flex`,alignItems:`center`,gap:`4px`},children:[(0,S.jsx)(`span`,{children:e.productName}),(0,S.jsx)(o,{size:14,style:{opacity:.7}})]}),(0,S.jsxs)(`p`,{style:{fontSize:`0.8rem`,color:`#6B7280`,margin:0},children:[`Thương hiệu: `,e.brand,` | Quy cách: `,e.options,` | Số lượng: x`,e.qty||1]})]})]}),(0,S.jsx)(`div`,{style:{textAlign:`right`,minWidth:`130px`},children:(()=>{let t=Math.round((Number(e.foreignPrice??e.priceKrw??e.priceWon)||0)*n*r);return(0,S.jsxs)(S.Fragment,{children:[(0,S.jsx)(`div`,{style:{fontSize:`0.92rem`,fontWeight:700,color:`var(--purple-primary)`},children:Z(t*(e.qty||1))}),(0,S.jsxs)(`div`,{style:{fontSize:`0.78rem`,color:`#6B7280`,marginTop:`2px`},children:[Z(t),` × `,e.qty||1]})]})})()})]}),e.adminNote&&(0,S.jsx)(`div`,{style:{marginTop:`4px`},children:(0,S.jsxs)(`p`,{style:{fontSize:`0.8rem`,color:`#D97706`,backgroundColor:`#FEF3C7`,padding:`6px 12px`,borderRadius:`8px`,display:`inline-block`,margin:0},children:[`💬 Ghi chú từ Admin: `,e.adminNote]})})]}),t&&(0,S.jsxs)(`div`,{style:{backgroundColor:`#F9FAFB`,padding:`14px 18px`,borderRadius:`12px`,border:`1px solid #E5E7EB`,display:`flex`,justifyContent:`space-between`,alignItems:`center`},children:[(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`span`,{style:{fontSize:`0.72rem`,color:`#6B7280`,display:`block`,fontWeight:600,letterSpacing:`0.5px`},children:`MÃ VẬN ĐƠN (AIR HÀN - VIỆT)`}),(0,S.jsx)(`strong`,{style:{fontSize:`0.95rem`,fontFamily:`monospace`,color:`var(--purple-primary)`,display:`block`,marginTop:`2px`},children:e.trackingCode||`Đang cập nhật...`})]}),e.trackingCode&&(0,S.jsxs)(`button`,{onClick:()=>pe(e.trackingCode),style:{backgroundColor:N===e.trackingCode?`#10B981`:`var(--purple-primary)`,color:`#FFF`,border:`none`,padding:`8px 14px`,borderRadius:`8px`,fontSize:`0.78rem`,fontWeight:600,cursor:`pointer`,display:`flex`,alignItems:`center`,gap:`6px`,transition:`all 0.2s ease`},children:[N===e.trackingCode?(0,S.jsx)(g,{size:14}):(0,S.jsx)(l,{size:14}),(0,S.jsx)(`span`,{children:N===e.trackingCode?`Đã chép`:`Sao chép`})]})]})]})})})()]},e.id)})})]}),A===`settings`&&(0,S.jsxs)(`div`,{children:[(0,S.jsxs)(`h3`,{style:{margin:`0 0 10px 0`,fontSize:`1.25rem`,fontWeight:700,color:`var(--purple-primary)`,display:`flex`,alignItems:`center`,gap:`10px`},children:[(0,S.jsx)(b,{size:22}),`CÀI ĐẶT & GIAO DIỆN HIỂN THỊ`]}),(0,S.jsx)(`p`,{style:{margin:`0 0 24px 0`,fontSize:`0.88rem`,color:`var(--text-muted)`},children:`Tùy chỉnh giao diện theo sở thích để có trải nghiệm mua sắm thoải mái và thuận mắt nhất. Cài đặt được lưu riêng cho trình duyệt này.`}),(0,S.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(auto-fit, minmax(260px, 1fr))`,gap:`20px`,marginBottom:`28px`},children:[(0,S.jsxs)(`div`,{onClick:()=>D(`light`),style:{border:E===`light`?`2px solid var(--purple-primary)`:`1px solid var(--border-color)`,borderRadius:`16px`,padding:`20px`,cursor:`pointer`,backgroundColor:E===`light`?`rgba(122, 75, 158, 0.06)`:`var(--bg-white)`,boxShadow:E===`light`?`0 4px 14px rgba(122, 75, 158, 0.12)`:`none`,transition:`all 0.2s ease`,position:`relative`},children:[E===`light`&&(0,S.jsx)(`span`,{style:{position:`absolute`,top:`14px`,right:`14px`,backgroundColor:`var(--purple-primary)`,color:`#FFF`,fontSize:`0.72rem`,fontWeight:700,padding:`3px 10px`,borderRadius:`20px`},children:`✓ Đang dùng`}),(0,S.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`12px`,marginBottom:`12px`},children:[(0,S.jsx)(`div`,{style:{width:`42px`,height:`42px`,borderRadius:`12px`,backgroundColor:`#FEF3C7`,color:`#D97706`,display:`flex`,alignItems:`center`,justifyContent:`center`},children:(0,S.jsx)(v,{size:24})}),(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`h4`,{style:{margin:0,fontSize:`1.05rem`,fontWeight:700,color:`var(--text-dark)`},children:`Chế độ Sáng (Light)`}),(0,S.jsx)(`span`,{style:{fontSize:`0.76rem`,color:`var(--text-muted)`},children:`Mặc định tinh tế`})]})]}),(0,S.jsx)(`p`,{style:{margin:0,fontSize:`0.84rem`,color:`var(--text-muted)`,lineHeight:`1.5`},children:`Tông màu ngà ấm áp (Ivory & Gold), phù hợp sử dụng vào ban ngày và nơi có đầy đủ ánh sáng tự nhiên.`})]}),(0,S.jsxs)(`div`,{onClick:()=>D(`dark`),style:{border:E===`dark`?`2px solid var(--purple-primary)`:`1px solid var(--border-color)`,borderRadius:`16px`,padding:`20px`,cursor:`pointer`,backgroundColor:E===`dark`?`rgba(157, 104, 202, 0.12)`:`var(--bg-white)`,boxShadow:E===`dark`?`0 4px 14px rgba(157, 104, 202, 0.18)`:`none`,transition:`all 0.2s ease`,position:`relative`},children:[E===`dark`&&(0,S.jsx)(`span`,{style:{position:`absolute`,top:`14px`,right:`14px`,backgroundColor:`var(--purple-primary)`,color:`#FFF`,fontSize:`0.72rem`,fontWeight:700,padding:`3px 10px`,borderRadius:`20px`},children:`✓ Đang dùng`}),(0,S.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`12px`,marginBottom:`12px`},children:[(0,S.jsx)(`div`,{style:{width:`42px`,height:`42px`,borderRadius:`12px`,backgroundColor:`#312E81`,color:`#A5B4FC`,display:`flex`,alignItems:`center`,justifyContent:`center`},children:(0,S.jsx)(f,{size:24})}),(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`h4`,{style:{margin:0,fontSize:`1.05rem`,fontWeight:700,color:`var(--text-dark)`},children:`Chế độ Tối (Dark)`}),(0,S.jsx)(`span`,{style:{fontSize:`0.76rem`,color:`var(--text-muted)`},children:`Neutral Dark Slate`})]})]}),(0,S.jsx)(`p`,{style:{margin:0,fontSize:`0.84rem`,color:`var(--text-muted)`,lineHeight:`1.5`},children:`Tông màu đen chì dịu mắt, độ tương phản cao, giúp giảm chói lóa và chống mỏi mắt khi mua sắm ban đêm.`})]})]}),(0,S.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,justifyContent:`space-between`,padding:`16px 20px`,borderRadius:`12px`,backgroundColor:`var(--bg-subtle-purple)`,border:`1px solid var(--border-color)`},children:[(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`div`,{style:{fontSize:`0.92rem`,fontWeight:700,color:`var(--text-dark)`},children:`Bật Chế Độ Tối (Dark Mode)`}),(0,S.jsx)(`div`,{style:{fontSize:`0.8rem`,color:`var(--text-muted)`,marginTop:`2px`},children:E===`dark`?`Đang bật - Giúp bảo vệ mắt khi mua sắm ban đêm`:`Đang tắt - Đang hiển thị giao diện ban ngày`})]}),(0,S.jsx)(`button`,{type:`button`,onClick:ae,style:{width:`54px`,height:`30px`,borderRadius:`15px`,backgroundColor:E===`dark`?`var(--purple-primary)`:`#CBD5E1`,border:`none`,position:`relative`,cursor:`pointer`,transition:`background-color 0.25s ease`,padding:`3px`},"aria-label":`Công tắc bật tắt chế độ tối`,children:(0,S.jsx)(`div`,{style:{width:`24px`,height:`24px`,borderRadius:`50%`,backgroundColor:`#FFF`,transform:E===`dark`?`translateX(24px)`:`translateX(0)`,transition:`transform 0.25s ease`,display:`flex`,alignItems:`center`,justifyContent:`center`,boxShadow:`0 2px 4px rgba(0,0,0,0.2)`},children:E===`dark`?(0,S.jsx)(f,{size:13,color:`var(--purple-primary)`}):(0,S.jsx)(v,{size:13,color:`#F59E0B`})})})]})]})]})]}),F&&(0,S.jsx)(p,{product:F,krwRate:se*L,onClose:()=>I(null),hideAddToCart:!0})]})}export{C as default};